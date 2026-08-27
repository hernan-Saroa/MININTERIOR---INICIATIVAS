import { useEffect, useRef, useState, type KeyboardEvent as TeclaReact } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Paperclip, ChevronRight, X } from 'lucide-react';
import { api, ErrorApi, SIN_CONEXION } from '../api/cliente';
import type { Iniciativa, Transicion, Estado, Movimiento, Direccion, CamposEditables } from '../api/tipos';
import { ModalAuth, type ModoAuth } from '../ui/modal-auth';
import { ModalRadicarIniciativa } from '../ui/modal-radicar';
import { PieInstitucional } from '../ui/pie-institucional';
import { useDialogo } from '../ui/base';
import '../tablero-aprobado.css';

// =====================================================================
// Tablero. Reproduce el diseño aprobado: mismo marcado, mismas clases y
// el CSS portado literal desde frontend/index.html.
//
// Las capacidades nuevas del flujo (mover, acotar, historial) viven en un
// panel que se abre encima. Es deliberado: la composición de la página no
// se puede modificar, así que lo nuevo se suma sin reorganizarla.
// =====================================================================

// El listado completo lo piden el resumen, la búsqueda global y el botón de
// exportar. Con tres claves distintas se hacían tres GET idénticos por carga:
// una sola constante los deja compartir la misma entrada de caché.
const CLAVE_TODAS = ['iniciativas', 'completas'] as const;

const CLASE_ESTADO: Record<string, string> = {
  gris: 'gris', azul: 'azul', ambar: 'ambar',
  verde: 'verde', rojo: 'rojo', morado: 'morado',
};

// Para nombrar el campo en el aviso de guardado fallido: la clave de la
// columna no le dice nada a quien está trabajando.
const NOMBRE_CAMPO: Record<string, string> = {
  nombre: 'Iniciativa',
  objeto: 'Objeto / alcance',
  numero_proyecto: 'No. proyecto',
  prioridad: 'Prioridad',
  fecha_actualizacion: 'Actualización',
};

// =====================================================================
// El tiempo, que es de lo que trata un rastreador de trámites.
//
// La pantalla mostraba «2026-08-05» y nada más. De un trámite lo que importa
// no es la fecha en que se tocó por última vez, sino cuánto lleva parado: eso
// es lo que distingue un expediente que avanza de uno olvidado, y el dato
// estaba en la base sin que nadie lo mirara.
// =====================================================================

// Umbral de atención, en días sin moverse.
//
// No sale de ninguna norma: es un punto de partida razonable para un trámite
// legislativo. Vive aquí, en un solo sitio, para que el equipo lo ajuste
// cuando tenga medidas propias de cuánto tarda de verdad cada etapa —el
// historial ya las está acumulando—.
const DIAS_PARA_ATENCION = 60;

// Días completos entre una fecha y hoy, comparando por día de calendario.
// Restar milisegundos daría un día de más o de menos según la hora y la zona,
// y aquí la unidad es el día, no el instante.
function diasDesde(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const soloDia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const dias = Math.floor((soloDia(new Date()) - soloDia(d)) / 86400000);
  return dias < 0 ? 0 : dias;
}

// El tiempo en palabras. «hace 43 días» se entiende de un vistazo; «2026-07-14»
// hay que restarlo mentalmente, y nadie lo hace mientras revisa dieciséis filas.
function enPalabras(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 21) return `hace ${dias} días`;
  if (dias < 60) {
    const semanas = Math.round(dias / 7);
    return `hace ${semanas} semanas`;
  }
  const meses = Math.round(dias / 30);
  return meses === 1 ? 'hace un mes' : `hace ${meses} meses`;
}

// Qué se puede decir del tiempo de una iniciativa, y con cuánta certeza.
//
// Son dos cosas distintas y no se pueden presentar igual:
//   · `desde_estado` es un hecho del sistema —la fecha del movimiento— así
//     que se puede afirmar «43 días en comisión».
//   · `fecha_actualizacion` la teclea una persona, así que como mucho se
//     puede decir «actualizada hace 43 días».
// Mientras el historial esté vacío, todo cae al segundo caso.
function tiempo(i: Iniciativa): {
  dias: number | null; texto: string; exacto: boolean; atencion: boolean;
} {
  const dEstado = diasDesde(i.desde_estado);
  if (dEstado !== null) {
    return {
      dias: dEstado,
      texto: dEstado === 0 ? `hoy en ${i.estado.toLowerCase()}` : `${dEstado} d en ${i.estado.toLowerCase()}`,
      exacto: true,
      atencion: dEstado >= DIAS_PARA_ATENCION,
    };
  }
  const dFecha = diasDesde(i.fecha_actualizacion);
  if (dFecha === null) return { dias: null, texto: 'sin fecha', exacto: false, atencion: false };
  return {
    dias: dFecha,
    texto: enPalabras(dFecha),
    exacto: false,
    atencion: dFecha >= DIAS_PARA_ATENCION,
  };
}

// =====================================================================
// Región viva única.
//
// No había ninguna en todo web/src: nada de lo que se guardaba, fallaba o
// cargaba se anunciaba a un lector de pantalla (WCAG 4.1.3, exigible por
// la Resolución 1519). Se resuelve con UNA sola región persistente en el
// árbol —si se monta y desmonta con cada mensaje, los lectores no la leen—
// a la que cualquier parte de la pantalla publica texto llano.
//
// `aria-live="polite"` y no `assertive`: no interrumpe a media frase, que
// para un acuse de guardado es lo correcto.
// =====================================================================
const AvisoVivo = { publicar: (_texto: string) => {} };

function RegionViva() {
  const [texto, setTexto] = useState('');
  const reloj = useRef<number | null>(null);
  useEffect(() => {
    AvisoVivo.publicar = (t: string) => {
      // Se limpia primero para que dos mensajes iguales seguidos también se
      // anuncien: si el nodo no cambia, el lector no dice nada.
      //
      // El temporizador se guarda y se cancela antes de programar el
      // siguiente: sin eso, dos avisos en menos de 60 ms se pisaban y solo
      // se leía el último, y al desmontar quedaba una actualización de
      // estado pendiente sobre un componente que ya no existe.
      if (reloj.current !== null) window.clearTimeout(reloj.current);
      setTexto('');
      reloj.current = window.setTimeout(() => setTexto(t), 60);
    };
    return () => {
      if (reloj.current !== null) window.clearTimeout(reloj.current);
      AvisoVivo.publicar = () => {};
    };
  }, []);
  return (
    <div
      // La marca permite que useDialogo la deje fuera de `inert`: si no,
      // los avisos publicados con un diálogo abierto no se anuncian.
      data-region-viva="true"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // Fuera de la vista pero presente para las ayudas técnicas. No se usa
      // `display:none` ni `visibility:hidden`, que lo esconderían también
      // del lector de pantalla.
      style={{
        position: 'absolute', width: 1, height: 1, margin: -1, padding: 0,
        overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
      }}
    >
      {texto}
    </div>
  );
}

export function Tablero({ publico = false }: { publico?: boolean }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Iniciativa | null>(null);
  const [modalAuth, setModalAuth] = useState<ModoAuth | null>(null);
  const [modalRadicar, setModalRadicar] = useState<string | null>(null);
  const [tokenRecuperacion, setTokenRecuperacion] = useState('');
  const [parametrosUrl, setParametrosUrl] = useSearchParams();
  const clienteConsultas = useQueryClient();

  // La pestaña y la consulta viven en la URL, no en el estado del componente.
  //
  // Con useState no se podía compartir un enlace a una iniciativa concreta ni
  // guardar en favoritos la consulta de un código, y el botón «atrás» del
  // navegador —el gesto más usado por quien tiene poca práctica— no deshacía
  // el filtro: sacaba del sitio.
  const direccionId = parametrosUrl.get('direccion') || 'todas';
  const busqueda = parametrosUrl.get('q') || '';
  // En la URL, igual que la pestaña y la consulta: así un funcionario puede
  // mandar por correo «mira estas, las de comisión con prioridad alta».
  const filtroEstado = parametrosUrl.get('estado') || '';
  const filtroPrioridad = parametrosUrl.get('prioridad') || '';

  // `replace` para el texto que se escribe: si cada tecla dejara una entrada
  // en el historial, «atrás» tendría que pulsarse una vez por letra.
  function fijarParametro(clave: string, valor: string, reemplazar = false) {
    const p = new URLSearchParams(parametrosUrl);
    if (valor && valor !== 'todas') p.set(clave, valor);
    else p.delete(clave);
    setParametrosUrl(p, { replace: reemplazar });
  }
  const setDireccionId = (v: string) => fijarParametro('direccion', v);
  const setBusqueda = (v: string) => fijarParametro('q', v, true);

  useEffect(() => {
    const tok = parametrosUrl.get('recuperar');
    if (tok) {
      setTokenRecuperacion(tok);
      setModalAuth('restablecer');
    }
  }, [parametrosUrl]);

  const { data: sesion } = useQuery({ queryKey: ['sesion'], queryFn: api.sesion, enabled: !publico });
  const { data: direcciones } = useQuery({ queryKey: ['direcciones'], queryFn: api.direcciones });
  // Del endpoint público, no de /admin/estados. Es la misma lista, pero
  // aquella exige el permiso `flujo.configurar`, que solo tienen
  // administrador y viceministro: para un editor o un director la
  // petición devolvía 403, `estados` quedaba undefined y el panel de
  // flujo no abría nunca. Sin mensaje: el botón simplemente no hacía
  // nada. Clave propia para no compartir caché con /admin/flujo, que sí
  // necesita la lista completa —estados desactivados incluidos—.
  const { data: estados } = useQuery({
    queryKey: ['estados-flujo'], queryFn: api.flujoPublico,
  });

  async function handleSalir() {
    await api.salir();
    clienteConsultas.invalidateQueries();
  }

  const activa = direccionId || 'todas';
  // `isLoadingError` es error SIN datos en caché. Con `isError` a secas, un
  // refetch fallido —y cada celda guardada dispara uno— pintaba «No se
  // pudieron cargar las iniciativas» justo debajo de la tabla que sí las
  // estaba mostrando. Cuando hay datos viejos, el aviso va como banda
  // discreta encima y no reemplaza la tabla.
  const { data: iniciativas, isLoading, isError, isLoadingError, error, refetch } = useQuery({
    queryKey: ['iniciativas', activa],
    queryFn: () => api.iniciativas(activa === 'todas' ? undefined : activa),
  });
  // Misma clave que usa el botón de exportar, para que compartan una sola
  // petición en vez de pedir dos veces el listado completo.
  const { data: todas } = useQuery({ queryKey: CLAVE_TODAS, queryFn: () => api.iniciativas() });

  // La consulta por código tiene que mirar TODAS las iniciativas, no solo
  // las de la pestaña abierta. Un ciudadano que vuelve con su código no
  // sabe a qué dirección pertenece su trámite, y buscando dentro de la
  // pestaña equivocada no encontraba nada.
  const consulta = busqueda.trim().toLowerCase();
  const universo = consulta ? (todas ?? iniciativas ?? []) : (iniciativas ?? []);

  const coincide = (i: Iniciativa) => {
    if (!consulta) return true;
    const codigo = `ini-2026-${String(i.id).padStart(4, '0')}`;
    return (
      codigo.includes(consulta) ||
      `#${i.id}`.includes(consulta) ||
      String(i.id) === consulta ||
      (i.nombre || '').toLowerCase().includes(consulta) ||
      (i.objeto || '').toLowerCase().includes(consulta) ||
      (i.numero_proyecto || '').toLowerCase().includes(consulta)
    );
  };

  const [porPagina, setPorPagina] = useState<number | 'todas'>(20);
  const [pagina, setPagina] = useState(1);

  // Al cambiar de dirección o al buscar, reseteamos la página a 1
  useEffect(() => {
    setPagina(1);
  }, [direccionId, busqueda, porPagina]);

  // El filtro de estado y prioridad se aplica ENCIMA de la consulta de texto:
  // si alguien busca un código concreto, quiere encontrarlo aunque tenga un
  // filtro puesto de antes. Por eso la búsqueda manda y el filtro afina.
  const visibles = universo
    .filter(coincide)
    .filter((i) => !filtroEstado || i.estado_clave === filtroEstado)
    .filter((i) => !filtroPrioridad || i.prioridad === filtroPrioridad);

  const totalIniciativas = visibles.length;
  const limitePorPagina = porPagina === 'todas' ? totalIniciativas : Number(porPagina);
  const totalPaginas = Math.max(1, Math.ceil(totalIniciativas / (limitePorPagina || 1)));
  const paginaValida = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = totalIniciativas > 0 ? (paginaValida - 1) * limitePorPagina : 0;
  const fin = Math.min(inicio + limitePorPagina, totalIniciativas);
  const iniciativasPaginadas = porPagina === 'todas' ? visibles : visibles.slice(inicio, fin);

  const direccion = activa === 'todas'
    ? {
        id: 'todas',
        nombre: 'Todas las Direcciones',
        nombre_corto: 'Todas',
        descripcion: 'Vista consolidada de todas las iniciativas legislativas vinculadas al Viceministerio para el Diálogo Social y los Derechos Humanos.',
      }
    : direcciones?.find((d) => d.id === activa);

  // El tipo Sesion declara `permisos` como obligatorio, pero la API puede
  // responder sin el campo si falla al resolverlos. Se normaliza aquí:
  // leerlo directamente dejaba la pantalla en blanco.
  const permisos = sesion?.permisos ?? [];
  const puedeEditar = !publico && permisos.includes('iniciativas.editar');
  const puedeAdministrar = !publico && permisos.some((p) =>
    ['usuarios.ver', 'roles.administrar', 'flujo.configurar', 'estadisticas.ver'].includes(p));

  // El resumen cuenta LO QUE ESTÁ EN ALCANCE, no siempre el total.
  //
  // Antes contaba todas las direcciones mientras la tabla mostraba la pestaña
  // activa, así que «15 iniciativas totales» encima de tres filas parecía un
  // error de la aplicación. Ahora que las tarjetas además filtran, la cifra
  // TIENE que coincidir con lo que se obtiene al pulsarla: un número que no
  // corresponde a su propio botón es peor que un número descolocado.
  const enAlcance = activa === 'todas' ? (todas ?? []) : (todas ?? []).filter((i) => i.direccion_id === activa);
  const porClave = (c: string) => enAlcance.filter((i) => i.estado_clave === c).length;

  // Los trámites detenidos. Es la pregunta que un tablero de seguimiento
  // debería responder sin que nadie la formule, y hasta ahora había que
  // leer las dieciséis filas y restar fechas a mano para saberlo.
  //
  // Se excluyen los estados finales: una iniciativa aprobada o archivada no
  // está detenida, está terminada.
  const detenidos = enAlcance.filter((i) => {
    if (i.estado_clave === 'aprobado' || i.estado_clave === 'archivado') return false;
    return tiempo(i).atencion;
  });

  // Las cinco tarjetas del resumen son los filtros.
  //
  // Eran cinco números grandes que invitaban a pulsarse y no hacían nada, y
  // «¿qué tengo en comisión con prioridad alta?» —la consulta diaria— no
  // tenía respuesta en ninguna parte. Convertirlas en controles no añade una
  // fila de chrome: reutiliza lo que ya se está leyendo.
  //
  // El estado y la prioridad son filtros INDEPENDIENTES y se acumulan, que es
  // justo lo que hace falta para esa pregunta.
  const resumen = [
    { n: enAlcance.length, l: 'Iniciativas totales', filtro: null },
    { n: porClave('radicado'), l: 'Radicadas', filtro: { estado: 'radicado' } },
    { n: porClave('comision'), l: 'En comisión', filtro: { estado: 'comision' } },
    { n: porClave('aprobado'), l: 'Aprobadas', filtro: { estado: 'aprobado' } },
    { n: enAlcance.filter((i) => i.prioridad === 'Alta').length, l: 'Prioridad alta',
      filtro: { prioridad: 'Alta' } },
  ] as const;

  const sinFiltros = !filtroEstado && !filtroPrioridad;

  // Base para los contadores de las pestañas: todas las direcciones, pero
  // con el estado y la prioridad activos ya aplicados. No se aplica la
  // búsqueda de texto, que es otra clase de consulta y no un filtro.
  const paraPestanas = (todas ?? []).filter((i) =>
    (!filtroEstado || i.estado_clave === filtroEstado) &&
    (!filtroPrioridad || i.prioridad === filtroPrioridad));

  // Qué tarjeta está activa. La de «totales» solo cuando no hay ningún filtro.
  const tarjetaActiva = (f: { estado?: string; prioridad?: string } | null) => {
    if (f === null) return sinFiltros;
    if ('estado' in f && f.estado) return filtroEstado === f.estado;
    if ('prioridad' in f && f.prioridad) return filtroPrioridad === f.prioridad;
    return false;
  };

  function alternarFiltro(f: { estado?: string; prioridad?: string } | null) {
    const p = new URLSearchParams(parametrosUrl);
    if (f === null) { p.delete('estado'); p.delete('prioridad'); }
    else if ('estado' in f && f.estado) {
      if (filtroEstado === f.estado) p.delete('estado'); else p.set('estado', f.estado);
    } else if ('prioridad' in f && f.prioridad) {
      if (filtroPrioridad === f.prioridad) p.delete('prioridad'); else p.set('prioridad', f.prioridad);
    }
    setParametrosUrl(p);
  }

  // =====================================================================
  // Panel de consulta: buscar, dirección y filtros activos.
  // =====================================================================

  // Las direcciones se arman como UNA lista con «Todas» al frente, en vez de
  // un botón suelto más un `map`. Es lo que permite recorrer el riel con las
  // flechas: hace falta el índice de la que está marcada, y con «Todas»
  // fuera de la lista no había índice que mover.
  const opcionesDireccion = [
    { id: 'todas', etiqueta: 'Todas', titulo: 'Mostrar iniciativas de todas las direcciones' },
    ...(direcciones ?? []).map((d) => ({
      id: d.id,
      etiqueta: d.nombre_corto,
      titulo: `Ver solo las de ${d.nombre}`,
    })),
  ];
  const cuentaDireccion = (id: string) => id === 'todas'
    ? paraPestanas.length
    : paraPestanas.filter((i) => i.direccion_id === id).length;

  const refBuscar = useRef<HTMLInputElement | null>(null);
  const refRiel = useRef<HTMLDivElement | null>(null);

  function elegirDireccion(id: string) {
    // Volver a pulsar la dirección marcada devuelve a «Todas». Es la salida
    // que la gente intenta sola, sin que nadie se la explique.
    setDireccionId(id === activa ? 'todas' : id);
    setAbierta(null);
  }

  // Flechas, Inicio y Fin sobre el riel, que es lo que corresponde a un
  // grupo de opciones excluyentes. Antes había que tabular por las siete
  // direcciones una a una para llegar a la última.
  function navegarRiel(e: TeclaReact<HTMLDivElement>) {
    const salto: Record<string, number> = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    };
    const total = opcionesDireccion.length;
    const i = Math.max(0, opcionesDireccion.findIndex((o) => o.id === activa));
    let j: number;
    if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = total - 1;
    else if (e.key in salto) j = (i + salto[e.key] + total) % total;
    else return;
    e.preventDefault();
    setDireccionId(opcionesDireccion[j].id);
    setAbierta(null);
    // El nodo sobrevive al re-render —va con `key`— así que se le puede dar
    // el foco ya; el navegador lo trae solo al campo de visión del riel.
    refRiel.current?.querySelectorAll<HTMLButtonElement>('.tab')[j]?.focus();
  }

  // En móvil el riel se desliza y la dirección marcada puede quedar fuera de
  // vista: al entrar por un enlace con ?direccion=… no se veía cuál estaba
  // puesta. Se centra moviendo `scrollLeft` a mano y no con
  // `scrollIntoView`, que arrastraría también el desplazamiento vertical de
  // la página hasta el riel.
  useEffect(() => {
    const riel = refRiel.current;
    if (!riel) return;
    // Si el riel cabe entero no hay nada que mover (y en jsdom, donde no hay
    // medidas, ambos valen 0 y sale por aquí).
    if (riel.scrollWidth <= riel.clientWidth) return;
    const marcada = riel.querySelector<HTMLElement>('.tab.active');
    if (!marcada) return;
    const caja = riel.getBoundingClientRect();
    const pildora = marcada.getBoundingClientRect();
    const centro = riel.scrollLeft + (pildora.left - caja.left)
      - (caja.width - pildora.width) / 2;
    riel.scrollLeft = Math.max(0, centro);
  }, [activa, direcciones]);

  // «/» lleva al buscador desde cualquier punto de la página: es el atajo
  // que ya conoce quien usa GitHub, Gmail o Jira. Se ignora mientras se
  // escribe en un campo o en una celda editable —si no, no se podría teclear
  // una barra— y con un diálogo abierto, que tiene su propio foco atrapado.
  useEffect(() => {
    function alPulsar(e: globalThis.KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const o = e.target as HTMLElement | null;
      // `isContentEditable` no basta: jsdom no lo implementa —así que la
      // prueba pasaba en verde mientras el atajo pisaba la escritura en las
      // celdas de la tabla— y en el navegador tampoco cubre el foco puesto
      // dentro de un hijo de la región editable. El atributo sí.
      if (o && (
        /^(INPUT|TEXTAREA|SELECT)$/.test(o.tagName)
        || o.isContentEditable
        || o.closest('[contenteditable="true"]')
      )) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      refBuscar.current?.focus();
      refBuscar.current?.select();
    }
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, []);

  // Lo que está aplicado, en un solo sitio y cada cosa con su propia salida.
  //
  // Antes había dos botones de «quitar filtro» en dos lugares distintos —uno
  // en el rótulo del resumen para estado y prioridad, otro con estilos en
  // línea junto al nombre de la dirección— y ninguno de los dos soltaba la
  // búsqueda de texto: para eso había que vaciar el campo a mano.
  const nombreEstadoFiltrado = estados?.find((e) => e.clave === filtroEstado)?.nombre ?? filtroEstado;
  const fichasFiltro = [
    consulta && {
      clave: 'Búsqueda',
      valor: `«${busqueda.trim()}»`,
      quitar: () => setBusqueda(''),
    },
    activa !== 'todas' && {
      clave: 'Dirección',
      valor: direccion?.nombre_corto ?? activa,
      quitar: () => setDireccionId('todas'),
    },
    filtroEstado && {
      clave: 'Estado',
      valor: nombreEstadoFiltrado,
      quitar: () => alternarFiltro({ estado: filtroEstado }),
    },
    filtroPrioridad && {
      clave: 'Prioridad',
      valor: filtroPrioridad,
      quitar: () => alternarFiltro({ prioridad: filtroPrioridad }),
    },
  ].filter(Boolean) as { clave: string; valor: string; quitar: () => void }[];

  function limpiarTodo() {
    const p = new URLSearchParams(parametrosUrl);
    for (const clave of ['q', 'direccion', 'estado', 'prioridad']) p.delete(clave);
    setParametrosUrl(p);
    setAbierta(null);
  }

  // Denominador de la línea de resultado: el registro completo. Mientras la
  // petición está en vuelo vale 0, y entonces no se muestra —«4 de 0» es
  // peor que no decir nada—.
  const totalRegistro = (todas ?? []).length;

  // La fecha de corte sale del SERVIDOR, no del reloj del navegador. Este
  // documento se imprime y se radica: un equipo con la hora mal puesta lo
  // fechaba mal y nadie lo notaba. Si el servidor no la da —versión antigua
  // de la API— se cae al reloj local, que es mejor que no mostrar nada.
  const { data: corte } = useQuery({ queryKey: ['corte'], queryFn: api.fechaServidor });
  const fechaCorte = new Date(corte ?? Date.now()).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <>
      <RegionViva />

      {/* Enlace de salto. Antes había trece pulsaciones de Tab —tres franjas
          institucionales— antes de llegar a la primera iniciativa, en cada
          carga. Solo se ve al recibir el foco (WCAG 2.4.1). */}
      <a
        href="#contenido"
        className="sr-solo-foco"
      >
        Ir al contenido
      </a>

      {/* 1. Barra Superior Oficial GOV.CO con color unificado #0b42b6

          Móvil: la altura es mínima y no fija (min-h-12 + py). Con h-12 el
          nombre y el rol se partían en tres o cuatro líneas dentro de 48 px
          y se montaban sobre la franja blanca de abajo, arrastrando además
          desplazamiento lateral a toda la página por debajo de 320 px. */}
      <div className="bg-gradient-to-r from-[#0939a0] via-[#0b42b6] to-[#1050c8] text-white w-full">
        <div className="mx-auto flex min-h-12 max-w-[1680px] w-full items-center justify-between gap-2 px-4 py-1.5 sm:gap-4 sm:px-8 sm:py-0">
          {/* Logotipo oficial GOV.CO */}
          <a
            href="https://www.gov.co"
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center hover:opacity-95 transition-opacity"
            title="Portal Único del Estado Colombiano - GOV.CO"
          >
            <img
              src="/logo-govco.png"
              alt="Logo Oficial GOV.CO"
              // Dimensiones reales del archivo: con ellas el navegador reserva
              // el hueco y la franja no salta al terminar de cargar.
              width={960}
              height={400}
              className="h-7 w-auto object-contain sm:h-8"
            />
          </a>

          {/* Menú y controles institucionales */}
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-normal text-white sm:gap-3.5">
            <a
              href="https://www.mininterior.gov.co"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hidden sm:inline"
            >
              Inicio Mininterior
            </a>

            {/* Aquí había un «EN» con cursor de mano y subrayado al pasar,
                que era un <span> sin onClick ni href: no hacía nada, y no hay
                ninguna infraestructura de idioma en el proyecto. Un control
                que aparenta funcionar es peor que su ausencia. Cuando exista
                traducción de verdad, vuelve. */}
            <span className="text-white/30 hidden sm:inline">|</span>

            {sesion ? (
              /* min-w-0 en el contenedor y truncate en el nombre: es lo que
                 permite que el nombre se recorte con puntos suspensivos en
                 vez de empujar los botones fuera de la pantalla. El rol se
                 oculta en móvil porque es lo menos útil de la línea. */
              <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-white">
                  {sesion.nombre}
                  <span className="hidden font-normal text-white/70 sm:inline">
                    {' '}({sesion.rol_nombre})
                  </span>
                </span>

                {puedeAdministrar && (
                  /* Una sola etiqueta, sin variante corta para móvil: el
                     ancho ya lo cede el nombre con min-w-0 + truncate.
                     Partirla en dos <span> alternativos concatenaba el
                     texto —«AdminAdministración»— y eso es exactamente lo
                     que lee un lector de pantalla. */
                  <Link
                    to="/admin/usuarios"
                    className="shrink-0 whitespace-nowrap rounded bg-white/20 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-white/30"
                  >
                    Administración
                  </Link>
                )}

                {/* Cambiar la propia contraseña no tenía acceso desde
                    ninguna pantalla, aunque el endpoint existiera. Con la
                    contraseña provisional el botón se resalta, porque hasta
                    cambiarla no se puede modificar nada. */}
                <button
                  type="button"
                  onClick={() => setModalAuth('cambiar')}
                  title="Cambiar mi contraseña"
                  className={
                    'shrink-0 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold transition '
                    + (sesion.debe_cambiar
                        ? 'bg-amber-300 text-[#3d2b00] hover:bg-amber-200'
                        : 'border border-white/40 text-white hover:bg-white/20')
                  }
                >
                  {sesion.debe_cambiar ? 'Cambiar contraseña' : 'Contraseña'}
                </button>

                <button
                  type="button"
                  onClick={handleSalir}
                  title="Cerrar sesión"
                  className="shrink-0 rounded border border-white/40 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20"
                >
                  Salir
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => setModalAuth('ingresar')}
                  aria-label="Iniciar sesión"
                  className="shrink-0 whitespace-nowrap rounded bg-white px-3 py-1.5 text-[12px] font-bold text-[#004884] shadow-sm transition hover:bg-slate-100"
                >
                  Iniciar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Franja Institucional Blanca Principal (idéntica a mininterior.gov.co) */}
      <header className="border-b border-linea bg-white shadow-[0_1px_6px_rgba(0,0,0,0.04)] w-full">
        <div className="mx-auto flex max-w-[1680px] w-full items-center justify-between gap-4 px-4 py-2.5 sm:px-8 sm:py-3.5">
          <div className="flex items-center gap-2.5 min-w-0 sm:gap-4">
            <img
              src="/logo-mininterior.png"
              alt="Logo Ministerio del Interior"
              width={428}
              height={432}
              className="h-9 w-auto shrink-0 object-contain sm:h-14"
            />

            <div className="hidden h-10 w-px bg-slate-200 sm:block" />

            <div className="flex min-w-0 flex-col justify-center">
              {/* El epígrafe sí puede recortarse: es contexto. */}
              <span className="truncate text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">
                Ministerio del Interior · República de Colombia
              </span>
              {/* El nombre del Viceministerio NO se trunca: con `truncate`
                  desaparecía justo la parte de Derechos Humanos en todos los
                  teléfonos. Se le deja envolver a dos líneas. */}
              <span className="text-[12.5px] font-bold leading-tight text-slate-900 sm:text-[14.5px] sm:leading-snug">
                Viceministerio para el Diálogo Social y los Derechos Humanos
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <span className="rounded-lg border border-[#cddaf7] bg-gradient-to-r from-[#eaf0fd] to-[#f4f7fe] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#2151d1]">
              Sistema de Iniciativas Legislativas
            </span>
          </div>
        </div>
      </header>

      <header className="page-head">
        <div className="inner">
          <h1>Iniciativas Legislativas por Dirección</h1>
          <div className="sub">
            Registro y seguimiento de las iniciativas legislativas de las direcciones
            vinculadas al Viceministerio: estado del trámite, prioridad y documentación
            soporte. Los datos se guardan en la base de datos institucional y son
            visibles para todo el equipo.
          </div>
          <div className="meta-row">
            <div className="meta-item"><div className="l">Dirigido a</div><div className="v">Despacho del Viceministro</div></div>
            <div className="meta-item"><div className="l">Corte</div><div className="v">{fechaCorte}</div></div>
            <div className="meta-item"><div className="l">Clasificación</div><div className="v">Uso interno</div></div>
            <div className="meta-item"><div className="l">Direcciones vinculadas</div><div className="v">{direcciones?.length ?? 0}</div></div>
          </div>
        </div>
      </header>

      <main id="contenido" className="wrap">
        <div className="inner content">
          {/* Con contraseña provisional toda escritura devuelve 403. Antes
              el funcionario descubría eso al intentar guardar, con un
              mensaje que no explicaba cómo salir del bloqueo: no había
              pantalla para cambiarla. Se avisa por adelantado y se ofrece
              el camino. role="status" para que un lector de pantalla lo
              anuncie sin robar el foco. */}
          {sesion?.debe_cambiar && (
            <div className="notice aviso-provisional" role="status">
              <b>Su contraseña es provisional.</b> Puede consultar el tablero,
              pero no modificar información hasta cambiarla.{' '}
              <button
                type="button"
                onClick={() => setModalAuth('cambiar')}
                className="enlace-provisional"
              >
                Cambiar mi contraseña ahora
              </button>
            </div>
          )}

          <div className="notice">
            <b>Tablero compartido:</b> los datos se guardan en la base de datos del
            servidor — cualquier persona que acceda a esta misma URL (dentro de la red
            institucional) verá y podrá editar las mismas iniciativas y documentos.
            El gestor de documentos funciona con <b>enlaces</b> al repositorio
            institucional (Drive, gestor documental, SECOP, etc.).
          </div>

          {sesion?.pendiente_aprobacion && (
            <div className="pendiente">
              <b>Su cuenta está pendiente de aprobación.</b> Puede consultar el tablero
              y ver sus propuestas marcadas, pero aún no puede editar. Un administrador
              le asignará dirección y permisos.
            </div>
          )}

          {/* El rótulo declara el alcance. Las cifras se calculan sobre TODAS
              las direcciones mientras la tabla de abajo muestra la pestaña
              activa, así que sin decirlo los números no cuadran con lo que se
              ve y parecen un error. */}
          <div className="section-title">
            <div className="badge-num">1</div>
            <h2>Resumen general</h2>
            <span className="alcance-resumen">
              {activa === 'todas' ? 'todas las direcciones' : (direccion?.nombre_corto ?? activa)}
            </span>
            {/* Aquí vivía un botón de «Quitar filtro» que solo soltaba el
                estado y la prioridad. Se movió al panel de consulta, donde
                ahora están las fichas de TODO lo aplicado —búsqueda y
                dirección incluidas— cada una con su propia salida. Las
                tarjetas siguen marcándose y soltándose al pulsarlas. */}
          </div>
          {/* Las tarjetas conservan la clase `.stat` del diseño aprobado —su
              borde superior azul, su tipografía, su relleno— y solo se les
              añade el comportamiento. No se usa `.pill-accion`, que borraría
              ese borde. */}
          <div className="stats">
            {resumen.map((s) => {
              const activaT = tarjetaActiva(s.filtro);
              return (
                <button
                  type="button"
                  key={s.l}
                  className={`stat stat-filtro${activaT ? ' activa' : ''}`}
                  aria-pressed={activaT}
                  onClick={() => { alternarFiltro(s.filtro); setAbierta(null); }}
                  title={s.filtro === null
                    ? 'Quitar los filtros'
                    : activaT ? `Quitar el filtro «${s.l}»` : `Ver solo: ${s.l}`}
                >
                  <div className="n">{s.n}</div>
                  <div className="l">{s.l}</div>
                </button>
              );
            })}
          </div>

          {detenidos.length > 0 && (
            <div className="aviso-estancados" role="status">
              <span className="marca" aria-hidden="true" />
              <span>
                <b>
                  {detenidos.length === 1
                    ? 'Un trámite lleva'
                    : `${detenidos.length} trámites llevan`}
                  {' '}más de {DIAS_PARA_ATENCION} días sin moverse.
                </b>{' '}
                Están marcados en la tabla.
              </span>
            </div>
          )}

          <div className="section-title"><div className="badge-num">2</div><h2>Iniciativas por dirección</h2></div>

          {/* ==========================================================
              Panel de consulta. Tres franjas: qué se busca, dónde se
              busca, y qué está aplicado.

              La instrucción no vive en el placeholder —se corta en el
              celular y desaparece al escribir—: va en una etiqueta visible
              y permanente. El campo se sube a 16 px bajo 860 px porque
              Safari en iOS amplía la página sobre cualquier campo menor y
              no vuelve al salir; la regla está en el CSS, para todos.
              ========================================================== */}
          <div className="consulta">
            <div className="consulta-franja">
              <label htmlFor="consulta-tramite" className="consulta-rotulo">
                Buscar un trámite
              </label>
              <div className="consulta-campo">
                <Search size={17} className="lupa" aria-hidden="true" />
                <input
                  id="consulta-tramite"
                  ref={refBuscar}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  // Escape vacía el campo. Es lo que ya hace el navegador en
                  // su propia barra de búsqueda, y ahorra borrar letra a
                  // letra o ir a buscar el botón con el ratón.
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && busqueda) {
                      e.stopPropagation();
                      setBusqueda('');
                    }
                  }}
                  placeholder="Código INI-2026-0001, título u objeto"
                  aria-describedby="ayuda-consulta"
                />
                {busqueda ? (
                  <button
                    type="button"
                    className="consulta-borrar"
                    onClick={() => { setBusqueda(''); refBuscar.current?.focus(); }}
                    aria-label="Limpiar la búsqueda"
                    title="Limpiar la búsqueda (Esc)"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                ) : (
                  // Solo cuando el campo está vacío: con texto dentro, ese
                  // hueco lo necesita el botón de limpiar.
                  <kbd className="consulta-atajo" aria-hidden="true">/</kbd>
                )}
              </div>
              <p className="consulta-ayuda" id="ayuda-consulta">
                Busca en <b>todas</b> las direcciones por código, título u objeto.
                El código se lo entregó el sistema al registrar la iniciativa.
                Pulse <code>/</code> desde cualquier punto de la página para volver aquí.
              </p>
            </div>

            <div className="consulta-franja">
              <span className="consulta-rotulo" id="rotulo-direccion">Dirección</span>
              {/* El envoltorio solo existe para el degradado del borde
                  derecho, que en móvil insinúa que el riel sigue. */}
              <div className="tabs-riel">
                <div
                  className="tabs"
                  // Un grupo de opciones excluyentes, que es lo que son:
                  // antes iban con aria-pressed, como siete interruptores
                  // independientes que resultaban no serlo.
                  role="radiogroup"
                  aria-labelledby="rotulo-direccion"
                  ref={refRiel}
                  onKeyDown={navegarRiel}
                >
                  {opcionesDireccion.map((o) => {
                    const marcada = o.id === activa;
                    const cuenta = cuentaDireccion(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={marcada}
                        // Tabulador itinerante: solo la marcada entra en el
                        // recorrido del tabulador, y dentro del riel se anda
                        // con las flechas.
                        tabIndex={marcada ? 0 : -1}
                        className={`tab${marcada ? ' active' : ''}`}
                        onClick={() => elegirDireccion(o.id)}
                        // La cuenta respeta el estado y la prioridad puestos,
                        // así que puede salir en cero. La píldora sigue
                        // pulsable —desactivarla rompería el recorrido con
                        // las flechas— pero el título avisa de que ahí no hay
                        // nada, en vez de dejar que se descubra pulsando.
                        title={marcada && o.id !== 'todas'
                          ? 'Quitar el filtro y ver todas'
                          : cuenta === 0
                            ? `${o.titulo} — ninguna con los filtros puestos`
                            : o.titulo}
                      >
                        {o.etiqueta}
                        <span className="count">{cuenta}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Franja de resultado. Va siempre montada, no solo cuando hay
                filtros: `role="status"` solo se anuncia si la región ya
                existía en el árbol antes de cambiar de texto. Y dice cuántas
                filas tiene la tabla justo encima de la tabla, que es donde
                se necesita el dato. */}
            <div className="consulta-resultado">
              <p
                className={`consulta-cuenta${totalIniciativas === 0 ? ' vacio' : ''}`}
                role="status"
              >
                <b className="cifras">{totalIniciativas}</b>
                {totalIniciativas === 1 ? ' iniciativa' : ' iniciativas'}
                {fichasFiltro.length > 0 && totalRegistro > 0 && (
                  <> de <b className="cifras">{totalRegistro}</b></>
                )}
              </p>

              {fichasFiltro.length > 0 && (
                <div className="consulta-chips">
                  <span className="consulta-chips-rotulo">Filtros</span>
                  {fichasFiltro.map((f) => (
                    <button
                      key={f.clave}
                      type="button"
                      className="chip-filtro"
                      onClick={f.quitar}
                      // El rótulo visible se lee «Estado: En comisión», pero
                      // el espacio lo pone el `gap` del flex, no el texto: sin
                      // aria-label el lector de pantalla anunciaría
                      // «Estado:En comisión» y sin decir que se puede quitar.
                      aria-label={`Quitar el filtro de ${f.clave.toLowerCase()}: ${f.valor}`}
                      title={`Quitar el filtro de ${f.clave.toLowerCase()}: ${f.valor}`}
                    >
                      <span className="chip-clave">{f.clave}:</span>
                      {f.valor}
                      <X size={12} className="chip-cruz" aria-hidden="true" />
                    </button>
                  ))}
                  {/* Con un solo filtro puesto sería el mismo botón dos
                      veces: su ficha ya lo quita. */}
                  {fichasFiltro.length > 1 && (
                    <button type="button" className="quitar-filtros" onClick={limpiarTodo}>
                      Quitar todos
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {direccion && (
            <div className="direccion-head">
              <div>
                {/* Aquí había un tercer botón de «✕ Quitar filtro (Ver
                    todas)», con estilos en línea y un color propio que no
                    era ninguno de la paleta. Era la tercera forma de soltar
                    un filtro en la misma pantalla: ahora la dirección se
                    suelta desde su ficha en el panel de consulta o volviendo
                    a pulsar su píldora. Este rótulo se queda como lo que
                    es: el nombre del alcance de la tabla de abajo. */}
                <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>{direccion.nombre}</h2>
                <p>{direccion.descripcion}</p>
              </div>
              <button
                type="button"
                className="add-btn"
                // Cadena vacía, no la primera dirección de la lista: desde
                // «Todas» no hay ninguna elección real que respetar, y
                // preseleccionar Diálogo Social es lo que la ola 4 vino a
                // impedir. `modalRadicar !== null` ya distingue cerrado de
                // abierto-sin-dirección.
                onClick={() => setModalRadicar(activa === 'todas' ? '' : activa)}
              >
                + Radicar iniciativa
              </button>
            </div>
          )}

          {/* Hay datos en caché pero la última actualización falló: la tabla
              de abajo es válida, solo puede estar desactualizada. Se avisa sin
              reemplazarla, que era el error de la primera versión. */}
          {isError && !isLoadingError && (
            <div className="pendiente" role="status">
              <b>No se pudo actualizar la lista.</b> Lo que ve es lo último que
              alcanzó a cargar.{' '}
              <button
                type="button"
                onClick={() => refetch()}
                className="underline"
                style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', color: 'inherit', padding: 0 }}
              >
                Volver a intentarlo
              </button>
            </div>
          )}

          {/* `role` explícito en la tabla y en cada fila y celda.
              Parece redundante —y en escritorio lo es— pero bajo 860 px el
              CSS pone `display:block` para convertir cada fila en tarjeta, y
              eso hace que el navegador DESCARTE los roles implícitos de
              tabla: el lector de pantalla deja de anunciar «fila 3 de 14,
              columna Estado» y lee una lista plana sin encabezados. Es la
              solución que recomienda la guía de WAI para tablas
              responsivas. Si se cambia el `display`, esto es lo que
              conserva la semántica. */}
          <table role="table">
            {/* El título de la tabla se anuncia pero no se dibuja: la
                composición no lo contempla, y un lector de pantalla
                necesita saber de qué es la tabla antes de recorrerla. */}
            <caption className="solo-lectores">
              {`Iniciativas de ${direccion?.nombre ?? 'todas las direcciones'}. `}
              {`${visibles.length} ${visibles.length === 1 ? 'iniciativa' : 'iniciativas'}.`}
            </caption>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col" className="col-iniciativa">Iniciativa</th>
                <th role="columnheader" scope="col" className="col-objeto">Objeto / alcance</th>
                <th role="columnheader" scope="col" className="col-num">No. proyecto</th>
                <th role="columnheader" scope="col" className="col-estado">Estado</th>
                <th role="columnheader" scope="col" className="col-prior">Prioridad</th>
                <th role="columnheader" scope="col" className="col-fecha">Actualización</th>
                <th role="columnheader" scope="col" className="col-docs">Documentos</th>
                {/* La octava columna es el botón de detalle. Sin nombre, un
                    lector de pantalla anuncia una columna vacía. */}
                <th role="columnheader" scope="col" className="col-del">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {iniciativasPaginadas.map((i) => {
                const dObj = (direcciones ?? []).find((d) => d.id === i.direccion_id);
                return (
                  <Fila key={i.id} iniciativa={i}
                    // Con una búsqueda activa se ven iniciativas de todas
                    // las direcciones, así que hay que mostrar de cuál es
                    // cada resultado aunque la pestaña sea otra.
                    direccionId={consulta ? 'todas' : activa}
                    nombreDireccion={dObj ? dObj.nombre_corto : ''}
                    editable={puedeEditar} miId={sesion?.id}
                    abierta={abierta === i.id}
                    onDocs={() => setAbierta(abierta === i.id ? null : i.id)}
                    onDetalle={() => setDetalle(i)} />
                );
              })}
            </tbody>
          </table>

          {/* Barra de paginación y selector de cantidad de registros */}
          {totalIniciativas > 0 && (
            <div className="mt-3.5 mb-2 flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 py-2.5 bg-panel rounded-lg border border-linea text-[12.5px] text-slate-700 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-tenue font-medium">Mostrar por página:</span>
                <div className="inline-flex rounded-md border border-linea bg-panel-2 p-0.5" role="group" aria-label="Cantidad de iniciativas por página">
                  {([20, 50, 100, 'todas'] as const).map((tam) => (
                    <button
                      key={tam}
                      type="button"
                      onClick={() => { setPorPagina(tam); setPagina(1); }}
                      className={`px-2.5 py-1 rounded text-[12px] font-semibold transition-colors ${
                        porPagina === tam
                          ? 'bg-white text-tinta shadow-sm'
                          : 'text-tenue hover:text-tinta'
                      }`}
                    >
                      {tam === 'todas' ? 'Todas' : tam}
                    </button>
                  ))}
                </div>
                <span className="text-tenue hidden sm:inline">|</span>
                <span className="text-tenue">
                  Mostrando <strong className="text-tinta">{inicio + 1}–{fin}</strong> de <strong className="text-tinta">{totalIniciativas}</strong> iniciativas
                </span>
              </div>

              {porPagina !== 'todas' && totalPaginas > 1 && (
                <div className="flex items-center gap-1.5" role="navigation" aria-label="Paginación de iniciativas">
                  <button
                    type="button"
                    disabled={paginaValida <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-linea bg-white font-medium text-tinta text-[12px] disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-panel-2 transition-colors"
                  >
                    Anterior
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPaginas }, (_, idx) => idx + 1)
                      .filter((p) => {
                        return p === 1 || p === totalPaginas || Math.abs(p - paginaValida) <= 1;
                      })
                      .map((p, i, arr) => {
                        const anterior = arr[i - 1];
                        const haySalto = anterior && p - anterior > 1;
                        return (
                          <span key={p} className="flex items-center gap-1">
                            {haySalto && <span className="px-0.5 text-tenue">…</span>}
                            <button
                              type="button"
                              onClick={() => setPagina(p)}
                              aria-current={paginaValida === p ? 'page' : undefined}
                              className={`h-7 w-7 rounded text-[12px] font-bold transition-colors ${
                                paginaValida === p
                                  ? 'bg-[#004884] text-white shadow-sm'
                                  : 'border border-linea bg-white text-tinta hover:bg-panel-2'
                              }`}
                            >
                              {p}
                            </button>
                          </span>
                        );
                      })}
                  </div>

                  <button
                    type="button"
                    disabled={paginaValida >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-linea bg-white font-medium text-tinta text-[12px] disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-panel-2 transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          )}

          {/* El estado vacío se calcula sobre la lista YA FILTRADA. Antes
              se calculaba sobre la lista sin filtrar, así que una búsqueda
              sin resultados dejaba la tabla en blanco y sin explicación:
              el ciudadano concluía que su radicación se había perdido. */}
          {isLoadingError ? (
            <div className="empty">
              <b>No se pudieron cargar las iniciativas.</b>
              <div style={{ marginTop: 6 }}>
                {error instanceof ErrorApi && error.estado === SIN_CONEXION
                  ? 'No hay conexión con el servidor.'
                  : 'El servidor respondió con un error.'}
                {' '}Los datos no se han perdido: vuelva a intentarlo en un momento.
              </div>
              <button type="button" className="add-btn" style={{ marginTop: 14 }} onClick={() => refetch()}>
                Reintentar
              </button>
            </div>
          ) : isLoading ? (
            <div className="loading">Cargando iniciativas…</div>
          ) : visibles.length === 0 && consulta ? (
            <div className="empty">
              <b>Ninguna iniciativa coincide con «{busqueda.trim()}».</b>
              <div style={{ marginTop: 6 }}>
                Revise el código —tiene la forma <b>INI-2026-0001</b>— o busque por una
                palabra del título. La consulta abarca todas las direcciones.
              </div>
              <button type="button" className="add-btn" style={{ marginTop: 14 }} onClick={() => setBusqueda('')}>
                Limpiar la búsqueda
              </button>
            </div>
          ) : visibles.length === 0 ? (
            <div className="empty">
              No hay iniciativas registradas en esta dirección. Use «+ Radicar iniciativa» para ingresar una propuesta.
            </div>
          ) : null}

          <footer>
            <span>Tablero de trabajo interno · no constituye registro oficial del trámite legislativo</span>
            <BotonExportar
              filas={visibles}
              direcciones={direcciones ?? []}
              alcance={consulta ? 'busqueda' : activa}
              cargando={isLoading}
            />
          </footer>
        </div>
      </main>

      {/* Pie institucional, réplica del de mininterior.gov.co. Va fuera de
          <main> porque no es contenido del tablero: es la ficha de la
          entidad. El descargo y el botón de exportar siguen dentro de la
          tarjeta de la tabla, que es lo que describen. */}
      <PieInstitucional />

      {detalle && estados && (
        <PanelFlujo iniciativa={detalle} estados={estados} onCerrar={() => setDetalle(null)} />
      )}

      {modalAuth && (
        <ModalAuth
          modoInicial={modalAuth}
          tokenInicial={tokenRecuperacion}
          onCerrar={() => {
            setModalAuth(null);
            setTokenRecuperacion('');
            if (parametrosUrl.has('recuperar')) {
              parametrosUrl.delete('recuperar');
              setParametrosUrl(parametrosUrl, { replace: true });
            }
          }}
          onExito={() => {
            clienteConsultas.invalidateQueries();
            setModalAuth(null);
            setTokenRecuperacion('');
            if (parametrosUrl.has('recuperar')) {
              parametrosUrl.delete('recuperar');
              setParametrosUrl(parametrosUrl, { replace: true });
            }
          }}
        />
      )}

      {modalRadicar !== null && (
        <ModalRadicarIniciativa
          direccionInicial={modalRadicar}
          sesion={sesion ?? null}
          onCerrar={() => setModalRadicar(null)}
          onIniciativaCreada={(id, dirId) => {
            // Los dos parámetros se fijan de una vez. Llamando a
            // `setDireccionId` y `setBusqueda` seguidos, el segundo partiría
            // de la URL anterior —la que capturó el render actual— y borraría
            // lo que acabó de poner el primero.
            const p = new URLSearchParams(parametrosUrl);
            if (dirId && dirId !== 'todas') p.set('direccion', dirId);
            else p.delete('direccion');
            p.set('q', `INI-2026-${String(id).padStart(4, '0')}`);
            setParametrosUrl(p);
            clienteConsultas.invalidateQueries({ queryKey: ['iniciativas'] });
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------
function Fila({ iniciativa: i, direccionId, nombreDireccion, editable, miId, abierta, onDocs, onDetalle }: {
  iniciativa: Iniciativa; direccionId: string; nombreDireccion?: string; editable: boolean;
  miId?: number; abierta: boolean; onDocs: () => void; onDetalle: () => void;
}) {
  const clienteConsultas = useQueryClient();
  // `miId !== undefined` es imprescindible: sin sesión la ola 4 retira
  // `propuesta_por`, así que `undefined === undefined` daba true y toda
  // propuesta ciudadana se rotulaba «propuesta mía» ante cualquier visitante.
  const mia = i.origen === 'propuesta' && miId !== undefined && i.propuesta_por === miId;

  // Un guardado que falla tiene que deshacerse en pantalla. Antes la
  // mutación no tenía onError: la celda conservaba el texto tecleado y
  // aparentaba haber guardado, así que se podía trabajar una tarde entera
  // perdiendo cada cambio sin enterarse.
  //
  // `revision` sube en cada fallo y entra en las dependencias del efecto
  // de Editable, que es lo que lo obliga a volver al valor del servidor:
  // el valor de la prop no cambió —el guardado no ocurrió—, así que sin
  // este contador el efecto no se dispararía.
  // El aviso y el contador van por CAMPO, no por fila. Con un solo estado
  // compartido, guardar bien el título borraba el aviso del guardado de la
  // fecha que acababa de fallar —y la reversión reescribía celdas vecinas que
  // aún tenían su guardado en vuelo—. Es decir: la pérdida silenciosa que
  // esto venía a cerrar, corrida un paso.
  const [fallos, setFallos] = useState<Record<string, string>>({});
  const [revisiones, setRevisiones] = useState<Record<string, number>>({});

  const guardar = useMutation({
    mutationFn: (cambios: Partial<CamposEditables>) => api.editarIniciativa(i.id, cambios),
    onSuccess: (_datos, cambios) => {
      const campo = Object.keys(cambios)[0] ?? '';
      setFallos((f) => {
        if (!(campo in f)) return f;
        const { [campo]: _, ...resto } = f;
        return resto;
      });
      // Sin esto el guardado era invisible para quien no ve la pantalla: no
      // había ningún acuse, ni visual ni anunciado.
      AvisoVivo.publicar(`${NOMBRE_CAMPO[campo] ?? campo} guardado.`);
      clienteConsultas.invalidateQueries({ queryKey: ['iniciativas'] });
    },
    onError: (e: ErrorApi, cambios) => {
      const campo = Object.keys(cambios)[0] ?? '';
      const mensaje = mensajeDeFallo(e);
      setFallos((f) => ({ ...f, [campo]: mensaje }));
      setRevisiones((r) => ({ ...r, [campo]: (r[campo] ?? 0) + 1 }));
      AvisoVivo.publicar(`${NOMBRE_CAMPO[campo] ?? campo}: ${mensaje}`);
    },
  });

  const avisos = Object.entries(fallos);
  const rev = (campo: string) => revisiones[campo] ?? 0;

  // Qué merece que se mire primero. Antes las dieciséis filas pesaban igual:
  // una archivada de prioridad baja se veía tan urgente como una radicada de
  // prioridad alta, y había que leerlas todas para saber cuál era cuál.
  const t = tiempo(i);
  const requiereAtencion = t.atencion || i.prioridad === 'Alta';

  return (
    <>
      <tr role="row" className={requiereAtencion ? 'fila-atencion' : undefined}>
        <td role="cell" className="col-iniciativa" data-etq="Iniciativa">
          <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--blue, #0066cc)',
              background: 'var(--blue-light, #e6f0fa)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 102, 204, 0.2)',
              display: 'inline-block'
            }}>
              INI-2026-{String(i.id).padStart(4, '0')}
            </span>
            {direccionId === 'todas' && nombreDireccion && (
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted, #475569)',
                background: 'var(--panel-2, #f1f5f9)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--line, #cbd5e1)',
                display: 'inline-block'
              }}>
                {nombreDireccion}
              </span>
            )}
          </div>
          <Editable revision={rev('nombre')} valor={i.nombre || ''} editable={editable}
            etiqueta="Nombre de la iniciativa"
            vacio="Escriba el nombre de la iniciativa"
            onGuardar={(v) => guardar.mutate({ nombre: v })} />
          {Boolean(i.fuente_publica) && <div className="source-tag">fuente pública</div>}
          {i.origen === 'propuesta' && (
            // El nombre de quien propuso solo llega si hay sesión: la API lo
            // retira para quien consulta sin cuenta. Cuando no viene, la
            // etiqueta dice de dónde salió la iniciativa sin decir de quién,
            // que es la parte que sí es información pública del trámite.
            <div className={`origen-tag${mia ? ' mia' : ''}`}>
              {mia
                ? 'propuesta mía'
                : i.propuesta_nombre
                  ? `propuesta · ${i.propuesta_nombre}`
                  : 'iniciativa ciudadana'}
            </div>
          )}
        </td>

        <td role="cell" className="col-objeto" data-etq="Objeto / alcance">
          <Editable revision={rev('objeto')} valor={i.objeto || ''} editable={editable} vacio="Sin objeto registrado"
            etiqueta="Objeto y alcance" multilinea
            onGuardar={(v) => guardar.mutate({ objeto: v })} />
        </td>

        <td role="cell" className="col-num" data-etq="No. proyecto">
          <Editable revision={rev('numero_proyecto')} valor={i.numero_proyecto || ''} editable={editable} vacio="Sin radicar"
            etiqueta="Número de proyecto"
            onGuardar={(v) => guardar.mutate({ numero_proyecto: v })} />
        </td>

        {/* El estado ya no es un desplegable libre: cambiarlo debe pasar por una
            transición permitida. Se conserva la píldora del diseño, pero abre
            el panel de acciones en vez de dejar saltar a cualquier estado. */}
        <td role="cell" className="col-estado" data-etq="Estado">
          <button type="button" className="estado-btn"
            data-v={i.estado} data-color={CLASE_ESTADO[i.estado_color] ?? 'azul'}
            onClick={onDetalle} title="Ver acciones e historial">
            {i.estado}
          </button>
          {/* Cuánto lleva así. Va debajo de la píldora porque es una propiedad
              del estado, no de la fecha: «43 días en comisión» responde a la
              pregunta que trae a alguien a este tablero. */}
          {t.dias !== null && (
            <div className={`tiempo-estado${t.atencion ? ' atencion' : ''}`}>
              {t.texto}
            </div>
          )}
        </td>

        <td role="cell" className="col-prior" data-etq="Prioridad">
          {editable ? (
            <select className="prior-sel" value={i.prioridad}
              // El CSS aprobado colorea por data-v (.prior-sel[data-v="Alta"]).
              // Sin el atributo, quien puede editar era el único que veía la
              // prioridad en gris, al revés de lo esperable.
              data-v={i.prioridad}
              aria-label={`Prioridad de ${i.nombre || 'esta iniciativa'}`}
              onChange={(e) => guardar.mutate({ prioridad: e.target.value as Iniciativa['prioridad'] })}>
              {['Alta', 'Media', 'Baja'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <span className="prior-lbl" data-v={i.prioridad}>{i.prioridad}</span>
          )}
        </td>

        <td role="cell" className="col-fecha" data-etq="Actualización">
          <Editable revision={rev('fecha_actualizacion')} valor={(i.fecha_actualizacion ?? '').slice(0, 10)} editable={editable} vacio="AAAA-MM-DD"
            etiqueta="Fecha de actualización (AAAA-MM-DD)" modo="numeric" normalizar={normalizarFecha}
            onGuardar={(v) => guardar.mutate({ fecha_actualizacion: v })} />
        </td>

        <td role="cell" className="col-docs" data-etq="Documentos">
          <button
            type="button"
            // .has-docs existe en el CSS aprobado y nunca se aplicaba: no se
            // distinguía a simple vista qué iniciativas tienen soporte.
            className={`docs-btn${i.total_documentos > 0 ? ' has-docs' : ''}${abierta ? ' open' : ''}`}
            onClick={onDocs}
            aria-expanded={abierta}
            aria-label={`${abierta ? 'Ocultar' : 'Ver'} los ${i.total_documentos} documentos de ${i.nombre || 'esta iniciativa'}`}
          >
            {/* Icono vectorial, no emoji. El 🖇 (U+1F587) no existe en las
                fuentes de Windows y caía a un glifo que se leía como «$»: el
                botón mostraba «$ 0» en vez de un clip y un número. Un emoji
                como iconografía cambia de forma según el sistema operativo y
                no hereda el color del texto. */}
            <Paperclip size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />
            <span aria-hidden="true" style={{ marginLeft: 5 }}>{i.total_documentos}</span>
          </button>
        </td>

        <td role="cell" className="col-del">
          <button
            type="button"
            // .del-btn se pone rojo al pasar el ratón porque en el diseño
            // original ese botón borraba. Hoy abre el detalle: se conserva su
            // geometría y se le quita la señal de peligro.
            className="del-btn abre-detalle"
            onClick={onDetalle}
            aria-label={`Ver acciones e historial de ${i.nombre || 'esta iniciativa'}`}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </td>
      </tr>

      {/* El fallo va en su propia fila, siguiendo el patrón de la fila de
          documentos: así se avisa sin alterar la composición de la tabla.
          role="alert" hace que un lector de pantalla lo anuncie solo. */}
      {avisos.length > 0 && (
        <tr role="row" className="docs-row">
          <td role="cell" colSpan={8}>
            {avisos.map(([campo, texto]) => (
              // Sin role="alert": el mismo texto ya se anuncia por la región
              // viva, y con los dos canales el lector lo leía dos veces.
              // Aquí queda como texto visible, que es su otro cometido.
              <div key={campo} className="capa-error"
                style={{ margin: 0, marginBottom: 6 }}>
                <b>{NOMBRE_CAMPO[campo] ?? campo}:</b> {texto}
                <button type="button" className="export-btn" style={{ marginLeft: 10 }}
                  onClick={() => setFallos((f) => {
                    const { [campo]: _, ...resto } = f;
                    return resto;
                  })}>
                  Entendido
                </button>
              </div>
            ))}
          </td>
        </tr>
      )}

      {abierta && <FilaDocumentos iniciativa={i} editable={editable} direccionId={direccionId} />}
    </>
  );
}

// ---------------------------------------------------------------------
// El mensaje que ve el funcionario cuando un guardado no llega. Nunca
// muestra el código crudo: «Error 500» no le dice nada a nadie.
function mensajeDeFallo(e: ErrorApi): string {
  if (e.estado === SIN_CONEXION) {
    return 'No hay conexión con el servidor, así que este cambio no se guardó. '
         + 'El texto anterior sigue en pie: vuelva a intentarlo cuando haya red.';
  }
  if (e.estado === 401) {
    return 'Su sesión se cerró, así que este cambio no se guardó. '
         + 'Vuelva a iniciar sesión y repítalo.';
  }
  // 400 y 403 traen un motivo redactado por la API; el resto no.
  if ((e.estado === 400 || e.estado === 403) && e.message) {
    return `Este cambio no se guardó: ${e.message}`;
  }
  return 'Este cambio no se guardó porque el servidor no pudo procesarlo. '
       + 'Vuelva a intentarlo; si sigue igual, avise al equipo de sistemas.';
}

// ---------------------------------------------------------------------
const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function Editable({
  valor, editable, vacio, onGuardar, revision = 0,
  etiqueta, multilinea = false, modo = 'text', normalizar = (v: string) => v.trim(),
}: {
  valor: string; editable: boolean; vacio: string; onGuardar: (v: string) => void;
  revision?: number;
  // Nombre accesible del campo. El encabezado de la tabla no le sirve a un
  // lector de pantalla dentro de un contenteditable, y en móvil la tabla se
  // convierte en tarjetas y el encabezado desaparece del todo.
  etiqueta: string;
  // Solo el objeto es prosa: ahí Shift+Enter parte el párrafo.
  multilinea?: boolean;
  // Teclado que pide el móvil.
  modo?: 'text' | 'numeric';
  // Corrección antes de guardar (la fecha en DD/MM/AAAA, por ejemplo).
  normalizar?: (v: string) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // El contenido inicial se fija una sola vez, para que el valor esté en el
  // primer renderizado. Después React no vuelve a tocar los hijos —si lo
  // hiciera, borraría el cursor mientras alguien escribe— y la
  // sincronización con cambios externos se hace a mano.
  const inicial = useRef(valor);

  // `revision` entra en las dependencias para poder deshacer un guardado
  // fallido. En ese caso `valor` no cambia —el servidor no aceptó nada—,
  // así que sin este contador el efecto no se volvería a ejecutar y la
  // celda se quedaría mostrando un texto que no está guardado.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== valor) {
      el.textContent = valor;
    }
  }, [valor, revision]);

  if (!editable) {
    return <span>{valor || <span className="sin-dato">{vacio}</span>}</span>;
  }

  return (
    <span
      ref={ref}
      className="cell-editable"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={etiqueta}
      aria-multiline={multilinea ? 'true' : 'false'}
      tabIndex={0}
      data-vacio={vacio}
      // En Android e iOS un contenteditable no ofrece por sí solo el teclado
      // adecuado ni la tecla de confirmar. Con esto la fecha abre el teclado
      // numérico y la tecla de acción dice «Listo» en vez de «Salto de línea».
      inputMode={modo}
      enterKeyHint="done"
      dangerouslySetInnerHTML={{ __html: escapar(inicial.current) }}
      onKeyDown={(e) => {
        // Enter confirma en vez de meter un salto de línea dentro del dato.
        // En el objeto, que es prosa, Shift+Enter sigue sirviendo para
        // partir el párrafo.
        if (e.key === 'Enter' && !(multilinea && e.shiftKey)) {
          e.preventDefault();
          e.currentTarget.blur();
          return;
        }
        // Escape descarta lo escrito y devuelve el valor guardado. Antes no
        // había forma de cancelar: cualquier tecleo accidental se guardaba
        // al salir de la celda.
        if (e.key === 'Escape') {
          e.preventDefault();
          const el = e.currentTarget;
          el.textContent = valor;
          el.blur();
        }
      }}
      onPaste={(e) => {
        // Pegar desde Word o Excel arrastra marcado. Se queda solo el texto.
        e.preventDefault();
        const texto = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ').trim();
        document.getSelection()?.deleteFromDocument();
        e.currentTarget.ownerDocument.execCommand('insertText', false, texto);
      }}
      onBlur={(e) => {
        const nuevo = normalizar(e.currentTarget.textContent ?? '');
        // Si la normalización cambió el texto, se refleja en la celda para
        // que la persona vea qué se guardó de verdad.
        if (nuevo !== e.currentTarget.textContent) e.currentTarget.textContent = nuevo;
        if (nuevo !== valor) onGuardar(nuevo);
      }}
    />
  );
}

// ---------------------------------------------------------------------
// La fecha se teclea a mano, y en Colombia se escribe DD/MM/AAAA. El
// servidor exige AAAA-MM-DD y antes rechazaba el resto con un error de
// formato que la persona no veía. Se traduce lo que es inequívoco y el
// resto se deja pasar tal cual, para que el servidor lo rechace y el
// aviso de la fila lo explique.
export function normalizarFecha(texto: string): string {
  const t = texto.trim();
  if (!t) return '';
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const [, d, mes, a] = m;
    return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return t;
}

// ---------------------------------------------------------------------
function FilaDocumentos({ iniciativa, editable, direccionId }: {
  iniciativa: Iniciativa; editable: boolean; direccionId: string;
}) {
  const [nombre, setNombre] = useState('');
  const [enlace, setEnlace] = useState('');
  const [error, setError] = useState('');
  const clienteConsultas = useQueryClient();

  const { data: documentos } = useQuery({
    queryKey: ['documentos', iniciativa.id],
    queryFn: () => api.documentos(iniciativa.id),
  });

  const agregar = useMutation({
    mutationFn: () => api.agregarDocumento(iniciativa.id, { nombre, enlace }),
    onSuccess: () => {
      setNombre(''); setEnlace(''); setError('');
      clienteConsultas.invalidateQueries({ queryKey: ['documentos', iniciativa.id] });
      clienteConsultas.invalidateQueries({ queryKey: ['iniciativas', direccionId] });
    },
    onError: (e: ErrorApi) => setError(e.message),
  });

  // El borrado no existía en ninguna pantalla: un enlace mal puesto se
  // quedaba para siempre. El CSS aprobado ya tenía el botón previsto
  // (`.doc-del`), solo faltaba renderizarlo.
  const quitar = useMutation({
    mutationFn: (documentoId: number) => api.eliminarDocumento(iniciativa.id, documentoId),
    onSuccess: () => {
      setError('');
      AvisoVivo.publicar('Documento retirado.');
      clienteConsultas.invalidateQueries({ queryKey: ['documentos', iniciativa.id] });
      clienteConsultas.invalidateQueries({ queryKey: ['iniciativas'] });
    },
    onError: (e: ErrorApi) => setError(mensajeDeFallo(e)),
  });

  // El CSS aprobado define .docs-panel, .docs-list, .doc-icon, .doc-name,
  // .docs-empty, .docs-note y .doc-del, y el portado no aplicó ninguna: el
  // panel usaba clases inventadas (.clip, .docs-hint) que no existen en
  // ningún CSS. La consecuencia visible: los enlaces a documentos no se
  // veían como enlaces, el «sin documentos» parecía un documento más, y las
  // notas quedaban sin estilo. Reponerlas restituye el aspecto aprobado.
  return (
    <tr role="row" className="docs-row">
      <td role="cell" colSpan={8}>
        <div className="docs-panel">
          {(documentos ?? []).length > 0 && (
            <ul className="docs-list">
              {(documentos ?? []).map((d) => (
                <li className="doc-item" key={d.id}>
                  <span className="doc-icon" aria-hidden="true">
                    <Paperclip size={13} style={{ verticalAlign: '-2px' }} />
                  </span>
                  <span className="doc-name">
                    {d.enlace
                      ? <a href={d.enlace} target="_blank" rel="noreferrer noopener">{d.nombre}</a>
                      : d.nombre}
                  </span>
                  {d.fecha && <span className="doc-meta">{d.fecha}</span>}
                  {editable && (
                    <button
                      type="button"
                      className="doc-del"
                      onClick={() => quitar.mutate(d.id)}
                      disabled={quitar.isPending}
                      aria-label={`Quitar el documento ${d.nombre}`}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(documentos ?? []).length === 0 && (
            <p className="docs-empty">Sin documentos asociados.</p>
          )}

          {editable && (
            <>
              <div className="docs-add">
                <input name="doc-nombre" placeholder="Nombre del documento"
                  aria-label="Nombre del documento"
                  value={nombre} onChange={(e) => setNombre(e.target.value)} />
                <input name="doc-link" type="url" inputMode="url"
                  placeholder="Enlace (Drive, gestor documental, SECOP…)"
                  aria-label="Enlace al documento"
                  value={enlace} onChange={(e) => setEnlace(e.target.value)} />
                <button type="button" className="docs-save"
                  disabled={agregar.isPending || !nombre.trim()}
                  onClick={() => agregar.mutate()}>Agregar</button>
              </div>
              {error && <div className="capa-error" role="alert">{error}</div>}
              <p className="docs-note">
                Use el campo «Enlace» para apuntar al documento en el repositorio
                institucional (Drive, OneDrive, gestor documental, SECOP).
              </p>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// Exporta LO QUE SE VE.
//
// Antes pedía el listado completo por su cuenta e ignoraba la pestaña y la
// búsqueda activas: alguien filtraba «Consulta Previa», exportaba, y se
// llevaba las quince iniciativas de todas las direcciones creyendo que eran
// las tres que tenía en pantalla. Ahora recibe la lista ya filtrada.
function BotonExportar({ filas: visibles, direcciones, alcance, cargando }: {
  filas: Iniciativa[]; direcciones: Direccion[]; alcance: string; cargando?: boolean;
}) {
  function exportar() {
    const nombreDireccion = (id: string) =>
      direcciones.find((d) => d.id === id)?.nombre ?? id;

    const filas = visibles.map((i) => [
      // El código es lo que usa el ciudadano para referirse a su iniciativa:
      // sin él, el CSV no se puede cruzar con nada.
      `INI-2026-${String(i.id).padStart(4, '0')}`,
      // El nombre de la dirección, no su identificador interno: «dialogo» no
      // le dice nada a quien abre el archivo.
      nombreDireccion(i.direccion_id),
      i.nombre, i.objeto, i.numero_proyecto,
      i.estado, i.prioridad, i.fecha_actualizacion ?? '',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    // El BOM hace que Excel en Windows reconozca el UTF-8
    const csv = '\uFEFF'
      + 'Código,Dirección,Iniciativa,Objeto,No. Proyecto,Estado,Prioridad,Actualización\n'
      + filas.join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    // La fecha en el nombre evita que tres descargas del mismo día se
    // sobrescriban entre sí en la carpeta de descargas.
    a.download = `iniciativas_${alcance}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    AvisoVivo.publicar(`Se descargaron ${visibles.length} iniciativas.`);
  }

  // El rótulo dice cuántas se lleva: es la forma más simple de que no haya
  // sorpresa entre lo que está en pantalla y lo que acaba en el archivo.
  return (
    <button type="button" className="export-btn" onClick={exportar}
      disabled={cargando || visibles.length === 0}>
      {cargando
        // Durante la carga la cifra sería 0 y parecería que no hay nada que
        // exportar, cuando lo que pasa es que aún no ha llegado.
        ? 'Preparando la exportación…'
        : `Exportar ${visibles.length} ${visibles.length === 1 ? 'iniciativa' : 'iniciativas'} a CSV`}
    </button>
  );
}

// ---------------------------------------------------------------------
function PanelFlujo({ iniciativa, estados, onCerrar }: {
  iniciativa: Iniciativa; estados: Estado[]; onCerrar: () => void;
}) {
  const [confirmar, setConfirmar] = useState<Transicion | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  // Acotar el alcance: la API, el procedimiento y el método del cliente
  // existían desde la migración 07 y ninguna pantalla lo invocaba, así que
  // era la única vía con trazabilidad para corregir el objeto y no se podía
  // usar. Reescribir el objeto en la celda, en cambio, sí se podía.
  const [acotando, setAcotando] = useState(false);
  const [objetoNuevo, setObjetoNuevo] = useState('');
  // Motivo propio. Compartirlo con la confirmación de una transición
  // funcionaba solo porque los dos botones se acordaban de limpiarlo: una
  // trampa esperando a que alguien añada un tercer camino.
  const [motivoAcotar, setMotivoAcotar] = useState('');
  const clienteConsultas = useQueryClient();
  const panel = useRef<HTMLDivElement>(null);

  // Este panel no puede usar el componente Modal —su aspecto lo fija el CSS
  // aprobado—, pero sí comparte su comportamiento de teclado y foco.
  //
  // Escape cierra por capas: si hay algo abierto encima vuelve atrás en vez de
  // cerrar el panel entero y tirar lo escrito. Las DOS capas cuentan —la
  // confirmación de una transición y el formulario de acotar—: con solo la
  // primera, Escape mientras se reescribía el objeto perdía todo el texto.
  //
  // El gancho guarda el manejador en una ref que actualiza en cada render,
  // así que lee los valores vigentes.
  useDialogo(panel, () => {
    // El orden importa: la confirmación de una transición se dibuja
    // REEMPLAZANDO el bloque de acciones, así que si las dos están puestas
    // la que se ve es la confirmación. Atender antes `acotando` cerraba
    // algo invisible y dejaba la confirmación en pantalla.
    if (confirmar) { setConfirmar(null); setError(''); return; }
    if (acotando) { setAcotando(false); setError(''); setMotivoAcotar(''); return; }
    onCerrar();
  });

  const { data: sesion } = useQuery({ queryKey: ['sesion'], queryFn: api.sesion });
  const { data: transiciones } = useQuery({
    queryKey: ['transiciones', iniciativa.id],
    queryFn: () => api.transiciones(iniciativa.id),
  });
  const { data: historial } = useQuery({
    queryKey: ['historial', iniciativa.id],
    queryFn: () => api.historial(iniciativa.id),
  });

  const mover = useMutation({
    mutationFn: (t: Transicion) => api.mover(iniciativa.id, t, motivo),
    onSuccess: (_datos, t) => {
      clienteConsultas.invalidateQueries();
      AvisoVivo.publicar(`${iniciativa.nombre} pasó a ${t.destino_nombre}.`);
      setConfirmar(null); setMotivo(''); onCerrar();
    },
    onError: (e: ErrorApi) => setError(e.message),
  });

  const acotar = useMutation({
    mutationFn: () => api.acotar(iniciativa.id, objetoNuevo.trim(), motivoAcotar.trim()),
    onSuccess: () => {
      clienteConsultas.invalidateQueries();
      AvisoVivo.publicar('Alcance acotado y registrado en el historial.');
      setAcotando(false); setObjetoNuevo(''); setMotivoAcotar(''); setError('');
      // El panel recibe una instantánea de la iniciativa, no una referencia
      // viva: tras acotar seguiría mostrando el objeto viejo, y reabrir el
      // formulario precargaría el texto que se acaba de sustituir. Se cierra,
      // igual que hace el movimiento de estado.
      onCerrar();
    },
    onError: (e: ErrorApi) => setError(mensajeDeFallo(e)),
  });

  return (
    <div className="capa-flujo" onClick={onCerrar}>
      <div ref={panel} className="capa-panel" role="dialog" aria-modal="true" tabIndex={-1}
        aria-label={`Acciones e historial de ${iniciativa.nombre}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="capa-cabeza">
          <div>
            <div className="capa-epi">Iniciativa</div>
            <h2>{iniciativa.nombre}</h2>
          </div>
          <button type="button" className="capa-cerrar" onClick={onCerrar}
            aria-label="Cerrar el panel de acciones">✕</button>
        </div>

        <div className="capa-cuerpo">
          <div className="capa-bloque">
            <div className="capa-epi">Recorrido del trámite</div>
            {/* El estado vigente se marcaba solo con color (WCAG 1.4.1 y
                1.3.1). Ahora la lista es un recorrido con pasos, el actual
                lleva aria-current, y hay una frase que lo dice con palabras
                para quien no distingue los tonos. */}
            <p className="capa-texto" style={{ margin: '6px 0 0' }}>
              Este trámite está hoy en <b>{iniciativa.estado}</b>.
            </p>
            <ol className="riel-estados">
              {estados.filter((e) => e.activo).map((e) => {
                const esActual = e.id === iniciativa.estado_id;
                return (
                  <li key={e.id}
                    aria-current={esActual ? 'step' : undefined}
                    className={`riel-paso ${CLASE_ESTADO[e.color] ?? 'azul'}${esActual ? ' actual' : ''}`}>
                    {esActual && <span className="solo-lectores">Estado actual: </span>}
                    {e.nombre}
                  </li>
                );
              })}
            </ol>
          </div>

          {confirmar ? (
            <div className="capa-bloque">
              <div className="capa-epi">{confirmar.etiqueta}</div>
              <p className="capa-texto">
                Pasará a <b>{confirmar.destino_nombre}</b>. Queda registrado con su
                nombre y la fecha.
              </p>
              {error && <div className="capa-error">{error}</div>}
              <textarea className="capa-motivo" rows={3} value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={confirmar.requiere_motivo
                  ? 'Motivo (obligatorio): qué debe corregirse.'
                  : 'Motivo (opcional).'} />
              <div className="capa-acciones">
                <button className="export-btn" onClick={() => { setConfirmar(null); setError(''); }}>
                  Cancelar
                </button>
                <button className="add-btn"
                  disabled={mover.isPending || (confirmar.requiere_motivo && !motivo.trim())}
                  onClick={() => mover.mutate(confirmar)}>
                  {mover.isPending ? 'Guardando…' : confirmar.etiqueta}
                </button>
              </div>
            </div>
          ) : (
            <div className="capa-bloque">
              <div className="capa-epi">Acciones disponibles para usted</div>
              {transiciones === undefined ? (
                <p className="capa-texto">Consultando…</p>
              ) : transiciones.length === 0 ? (
                <p className="capa-texto">
                  No es responsable de <b>{iniciativa.estado}</b>, así que no puede
                  moverla. Puede consultarla y ver su historial.
                </p>
              ) : (
                <div className="capa-acciones">
                  {transiciones.map((tr) => (
                    <button key={tr.id}
                      className={tr.tipo === 'avanzar' ? 'add-btn' : 'export-btn'}
                      onClick={() => { setMotivo(''); setError(''); setConfirmar(tr); }}>
                      {tr.etiqueta}
                    </button>
                  ))}
                </div>
              )}
              {sesion && !sesion.permisos.includes('flujo.mover') && (
                <p className="capa-texto">Su rol no incluye el permiso de mover iniciativas.</p>
              )}

              {/* Acotar es la vía con constancia para corregir el objeto: pide
                  motivo y deja asiento en el historial. El botón se muestra
                  siempre porque la API no informa de `puede_acotar`; si el rol
                  no lo tiene, el procedimiento responde y el error se explica
                  aquí mismo. */}
              {acotando ? (
                <div style={{ marginTop: 12 }}>
                  <div className="capa-epi">Nuevo objeto y alcance</div>
                  <textarea className="capa-motivo" rows={4} value={objetoNuevo}
                    aria-label="Nuevo objeto y alcance de la iniciativa"
                    onChange={(e) => setObjetoNuevo(e.target.value)}
                    placeholder="Escriba el objeto corregido." />
                  <textarea className="capa-motivo" rows={2} value={motivoAcotar}
                    aria-label="Motivo del acotamiento"
                    onChange={(e) => setMotivoAcotar(e.target.value)}
                    placeholder="Motivo (obligatorio): por qué se acota el alcance." />
                  <p className="capa-texto">
                    El objeto anterior queda guardado en el historial, con su
                    nombre y la fecha.
                  </p>
                  <div className="capa-acciones">
                    <button type="button" className="export-btn"
                      onClick={() => { setAcotando(false); setError(''); setMotivoAcotar(''); }}>
                      Cancelar
                    </button>
                    <button type="button" className="add-btn"
                      disabled={acotar.isPending || !objetoNuevo.trim() || !motivoAcotar.trim()}
                      onClick={() => acotar.mutate()}>
                      {acotar.isPending ? 'Guardando…' : 'Acotar el alcance'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="capa-acciones" style={{ marginTop: 12 }}>
                  <button type="button" className="export-btn"
                    onClick={() => {
                      setObjetoNuevo(iniciativa.objeto ?? '');
                      setMotivoAcotar(''); setError(''); setAcotando(true);
                    }}>
                    Acotar el alcance
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="capa-bloque">
            <div className="capa-epi">Historial</div>
            {!historial ? <p className="capa-texto">Consultando…</p>
              : historial.length === 0 ? <p className="capa-texto">Sin movimientos registrados.</p>
              : <ol className="linea-tiempo">{historial.map((m) => <Movimientos key={m.id} m={m} />)}</ol>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Movimientos({ m }: { m: Movimiento }) {
  return (
    <li className={`mov mov-${m.tipo}`}>
      <div className="mov-titulo">
        {m.tipo === 'acotar' ? 'Acotó el alcance'
          : m.tipo === 'creacion' ? 'Registró la iniciativa'
          // Una edición no cambia de estado, así que la rama de abajo
          // pintaría «En comisión → En comisión». Dice qué campo se corrigió.
          : m.tipo === 'edicion' ? `Corrigió ${NOMBRE_CAMPO[m.campo ?? ''] ?? 'un dato'}`
          : <>{m.estado_anterior} → <b>{m.estado_nuevo}</b></>}
      </div>
      <div className="mov-meta">{m.usuario} · {m.creado_en}</div>
      {m.motivo && <div className="mov-motivo">{m.motivo}</div>}
      {m.valor_anterior && <div className="mov-antes">{m.valor_anterior}</div>}
    </li>
  );
}
