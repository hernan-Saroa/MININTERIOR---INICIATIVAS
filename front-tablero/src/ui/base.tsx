import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ColorEstado, Alcance } from '../api/tipos';
import { ErrorApi, SIN_CONEXION } from '../api/cliente';

// =====================================================================
// Piezas base. Los colores de estado se resuelven aquí en un único
// lugar: el catálogo es configurable, así que el mapa vive junto a la
// pieza que lo pinta y no repartido por las pantallas.
// =====================================================================

const TONOS: Record<ColorEstado, { fondo: string; texto: string; borde: string; solido: string }> = {
  gris:   { fondo: 'bg-gris-tenue',   texto: 'text-gris',   borde: 'border-linea',        solido: 'bg-gris' },
  azul:   { fondo: 'bg-accion-tenue', texto: 'text-accion', borde: 'border-accion-borde', solido: 'bg-accion' },
  ambar:  { fondo: 'bg-ambar-tenue',  texto: 'text-ambar',  borde: 'border-amber-200',    solido: 'bg-ambar' },
  verde:  { fondo: 'bg-verde-tenue',  texto: 'text-verde',  borde: 'border-emerald-200',  solido: 'bg-verde' },
  rojo:   { fondo: 'bg-rojo-tenue',   texto: 'text-rojo',   borde: 'border-red-200',      solido: 'bg-rojo' },
  morado: { fondo: 'bg-morado-tenue', texto: 'text-morado', borde: 'border-violet-200',   solido: 'bg-morado' },
};

export const tono = (c: ColorEstado) => TONOS[c] ?? TONOS.azul;

export function Insignia({ color, children, tamano = 'normal' }: {
  color: ColorEstado; children: ReactNode; tamano?: 'normal' | 'chico';
}) {
  const t = tono(color);
  return (
    <span className={`inline-flex items-center rounded-full font-bold whitespace-nowrap ${t.fondo} ${t.texto} ${
      tamano === 'chico' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
    }`}>
      {children}
    </span>
  );
}

const ETIQUETA_ALCANCE: Record<Alcance, { texto: string; tono: string }> = {
  publico:      { texto: 'Pública',        tono: 'bg-rojo-tenue text-rojo' },
  autenticado:  { texto: 'Con cuenta',     tono: 'bg-accion-tenue text-accion' },
  direccion:    { texto: 'Su dirección',   tono: 'bg-gris-tenue text-gris' },
  responsables: { texto: 'Responsables',   tono: 'bg-morado-tenue text-morado' },
};

export function Visibilidad({ alcance }: { alcance: Alcance }) {
  const e = ETIQUETA_ALCANCE[alcance];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold ${e.tono}`}>
      {e.texto}
    </span>
  );
}

export function Boton({ children, onClick, variante = 'principal', tamano = 'normal', disabled, tipo = 'button', ancho }: {
  children: ReactNode;
  onClick?: () => void;
  variante?: 'principal' | 'secundario' | 'peligro' | 'fantasma';
  tamano?: 'normal' | 'chico';
  disabled?: boolean;
  tipo?: 'button' | 'submit';
  ancho?: boolean;
}) {
  const variantes = {
    principal:  'bg-accion text-white hover:bg-accion-fuerte border-transparent',
    secundario: 'bg-panel text-tinta hover:bg-panel-2 border-linea-fuerte',
    peligro:    'bg-panel text-rojo hover:bg-rojo-tenue border-red-200',
    fantasma:   'bg-transparent text-tenue hover:text-tinta hover:bg-panel-2 border-transparent',
  }[variante];
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-semibold
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantes}
        ${tamano === 'chico' ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-4 py-2.5 text-[14px]'}
        ${ancho ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-linea bg-panel ${className}`}>{children}</div>
  );
}

export function Epigrafe({ children }: { children: ReactNode }) {
  return <div className="epigrafe">{children}</div>;
}

// Contexto que enlaza el campo con su etiqueta, su pista y su error.
export const ContextoCampo = createContext<{
  id?: string; describe?: string; invalido?: boolean;
}>({});

// El error y la pista se leen al llegar al campo, pero como DESCRIPCIÓN, no
// como parte del nombre.
//
// La primera versión los metía dentro del <label>, y todo el texto de un
// label envuelto forma el nombre accesible del control: el campo pasaba a
// llamarse «Título o nombre de la iniciativa Denominación clara del proyecto
// o propuesta El título debe tener al menos 8 caracteres, para que se
// entienda de qué se trata». Un nombre así es inservible para navegar por
// campos, que es justo lo que hace quien usa lector de pantalla.
//
// Ahora el label solo envuelve la etiqueta, y pista y error se enlazan con
// aria-describedby. El nombre queda limpio y la descripción se anuncia
// después.
export function Campo({ etiqueta, pista, error, children }: {
  etiqueta: string; pista?: string; error?: string; children: ReactNode;
}) {
  const base = useId();
  const idPista = pista ? `${base}-pista` : undefined;
  const idError = error ? `${base}-error` : undefined;
  const describe = [idPista, idError].filter(Boolean).join(' ') || undefined;

  return (
    <div className="block">
      <label htmlFor={base} className="mb-1.5 block text-[12px] font-bold tracking-[0.01em]">
        {etiqueta}
      </label>
      {pista && (
        <span id={idPista} className="mb-1.5 block text-[11.5px] leading-snug text-tenue">
          {pista}
        </span>
      )}
      {/* El control recibe su id y su descripción sin que cada pantalla tenga
          que repetirlos: así ningún campo se queda sin enlazar por olvido. */}
      <ContextoCampo.Provider value={{ id: base, describe, invalido: !!error }}>
        {children}
      </ContextoCampo.Provider>
      {error && (
        <span id={idError} className="mt-1.5 block text-[12px] font-semibold leading-snug text-rojo">
          {error}
        </span>
      )}
    </div>
  );
}



const claseCampo =
  'w-full rounded-md border border-linea bg-panel px-3 py-2.5 text-[14px] text-tinta ' +
  'placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12';

export function Texto({ valor, onChange, placeholder, maxLength, invalido, id }: {
  valor: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number;
  invalido?: boolean; id?: string;
}) {
  const c = useContext(ContextoCampo);
  const mal = invalido ?? c.invalido;
  return (
    <input
      type="text"
      id={id ?? c.id}
      aria-describedby={c.describe}
      value={valor} maxLength={maxLength} placeholder={placeholder}
      aria-invalid={mal || undefined}
      onChange={(e) => onChange(e.target.value)}
      // El borde rojo no puede ser la única señal (WCAG 1.4.1): el texto del
      // error va debajo, en Campo, y aria-invalid lo marca para el lector.
      className={`${claseCampo}${mal ? ' border-rojo focus:border-rojo focus:ring-rojo/12' : ''}`}
    />
  );
}

export function AreaTexto({ valor, onChange, placeholder, filas = 3 }: {
  valor: string; onChange: (v: string) => void; placeholder?: string; filas?: number;
}) {
  const c = useContext(ContextoCampo);
  return (
    <textarea id={c.id} aria-describedby={c.describe} aria-invalid={c.invalido || undefined}
      value={valor} rows={filas} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${claseCampo} resize-y leading-relaxed`} />
  );
}

export function Selector<T extends string | number>({ valor, onChange, opciones }: {
  valor: T; onChange: (v: string) => void; opciones: { valor: T; texto: string }[];
}) {
  const c = useContext(ContextoCampo);
  return (
    <select id={c.id} aria-describedby={c.describe} aria-invalid={c.invalido || undefined}
      value={valor} onChange={(e) => onChange(e.target.value)} className={claseCampo}>
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
    </select>
  );
}

export function Interruptor({ activo, onChange, etiqueta }: {
  activo: boolean; onChange: (v: boolean) => void; etiqueta: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      onClick={() => onChange(!activo)}
      className="flex items-center gap-2 text-left"
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${activo ? 'bg-accion' : 'bg-linea-fuerte'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${activo ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="text-[13px]">{etiqueta}</span>
    </button>
  );
}

export function Vacio({ titulo, detalle, accion }: { titulo: string; detalle: string; accion?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="mb-1.5 text-[15px] font-bold">{titulo}</p>
      <p className="mx-auto mb-5 max-w-sm text-[13.5px] leading-relaxed text-tenue">{detalle}</p>
      {accion}
    </div>
  );
}

// =====================================================================
// Estado de una pantalla de administración que no se pudo cargar.
//
// Las cuatro pantallas de /admin solo trataban `isLoading`, así que una
// respuesta 403 dejaba la pantalla vacía y muda: parecía «no hay nada»
// cuando en realidad era «no tiene permiso». Con la comprobación de
// permisos activa en la API, ese caso pasó de teórico a corriente —basta
// entrar por la URL sin el permiso—, así que hay que decirlo.
// =====================================================================
export function ErrorPantalla({ error, onReintentar }: {
  error: unknown; onReintentar?: () => void;
}) {
  const estado = error instanceof ErrorApi ? error.estado : null;

  const { titulo, detalle, reintentable } =
    estado === 403 ? {
      titulo: 'No tiene permiso para ver esta pantalla',
      detalle: error instanceof ErrorApi ? error.message
             : 'Su rol no incluye el permiso necesario. Solicítelo a un administrador.',
      reintentable: false,
    } : estado === 401 ? {
      titulo: 'Su sesión se cerró',
      detalle: 'Vuelva a iniciar sesión para continuar.',
      reintentable: false,
    } : estado === SIN_CONEXION ? {
      titulo: 'No hay conexión con el servidor',
      detalle: 'Revise su red. Los datos guardados no se han perdido.',
      reintentable: true,
    } : {
      titulo: 'No se pudo cargar esta pantalla',
      detalle: 'El servidor respondió con un error. Vuelva a intentarlo; si sigue igual, '
             + 'avise al equipo de sistemas.',
      reintentable: true,
    };

  return (
    <div className="px-6 py-12 text-center" role="alert">
      <p className="mb-1.5 text-[15px] font-bold">{titulo}</p>
      <p className="mx-auto mb-5 max-w-md text-[13.5px] leading-relaxed text-tenue">{detalle}</p>
      {reintentable && onReintentar && (
        <Boton variante="secundario" tamano="chico" onClick={onReintentar}>
          Volver a intentarlo
        </Boton>
      )}
    </div>
  );
}

export function Cargando({ texto = 'Cargando' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-[13.5px] text-tenue">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accion" />
      {texto}
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'ok' | 'atencion'; children: ReactNode }) {
  const estilos = {
    error:    'bg-rojo-tenue text-rojo border-red-200',
    ok:       'bg-verde-tenue text-verde border-emerald-200',
    atencion: 'bg-ambar-tenue text-ambar border-amber-200',
  }[tipo];
  return (
    <div className={`rounded-md border border-l-[3px] px-3.5 py-2.5 text-[13px] leading-relaxed ${estilos}`}>
      {children}
    </div>
  );
}

// Controles que pueden recibir el foco dentro de un contenedor, en el
// orden en que los recorre el tabulador. Se excluye lo deshabilitado y lo
// oculto: un botón con `hidden sm:inline` no debe capturar el foco en
// móvil, y eso no se ve mirando solo el selector.
function enfocables(raiz: HTMLElement | null): HTMLElement[] {
  if (!raiz) return [];
  const selector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const todos = Array.from(raiz.querySelectorAll<HTMLElement>(selector))
    .filter((el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true');

  // Se prefieren los que están a la vista: un botón con `hidden sm:inline` no
  // debe capturar el foco en móvil, y eso no se ve mirando el selector.
  //
  // Pero la comprobación depende de la maquetación, y hay entornos donde no
  // hay ninguna —jsdom, una captura sin CSS— en los que filtraría TODO. Si
  // no queda nada, se usa la lista sin filtrar: es mejor un tope de
  // tabulación de más que una trampa de teclado.
  const visibles = todos.filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
  return visibles.length > 0 ? visibles : todos;
}

// =====================================================================
// Comportamiento de teclado y foco de cualquier diálogo.
//
// Lo usan las dos implementaciones que hay —la hoja `Modal` de esta capa y
// el panel de flujo del tablero, que no puede usarla porque su aspecto
// viene del CSS aprobado—. Vive aquí una sola vez para que no se
// desincronicen: un diálogo con trampa de foco y otro sin ella es peor que
// dos iguales.
//
// Hace cuatro cosas, y las cuatro son criterios de la Resolución 1519:
//   · lleva el foco dentro al abrir            (2.4.3 orden del foco)
//   · lo atrapa mientras está abierto          (2.1.1 teclado)
//   · lo devuelve a quien abrió, al cerrar     (2.4.3)
//   · cierra con Escape                        (2.1.2 sin trampas)
// Y retira el resto de la página del árbol de accesibilidad con `inert`.
// =====================================================================
export function useDialogo(
  panel: React.RefObject<HTMLElement | null>,
  alCerrar: () => void,
) {
  const abridor = useRef<Element | null>(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    abridor.current = document.activeElement;
    const primero = enfocables(panel.current)[0];
    (primero ?? panel.current)?.focus();

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar.current(); return; }
      if (e.key !== 'Tab') return;
      const lista = enfocables(panel.current);
      // Sin nada que enfocar NO se intercepta: anular Tab sin mover el foco
      // deja a la persona encerrada sin salida, que es peor que dejarla
      // salir del diálogo (WCAG 2.1.2).
      if (lista.length === 0) return;
      const pri = lista[0];
      const ult = lista[lista.length - 1];
      const act = document.activeElement;

      // Si el foco se ha ido FUERA del diálogo, se trae de vuelta. Pasa a
      // menudo y sin nada rebuscado: al desaparecer el botón que lo tenía
      // —cerrar un sub-panel— o al deshabilitarse mientras se envía un
      // formulario, el navegador lo deja en <body>. Desde ahí el Tab
      // siguiente recorría la página de detrás, porque las comparaciones
      // de abajo solo contemplan el primero y el último.
      if (!panel.current || !panel.current.contains(act)) {
        e.preventDefault();
        (e.shiftKey ? ult : pri).focus();
        return;
      }

      if (e.shiftKey && (act === pri || act === panel.current)) {
        e.preventDefault(); ult.focus();
      } else if (!e.shiftKey && act === ult) {
        e.preventDefault(); pri.focus();
      }
    };
    document.addEventListener('keydown', alPulsar);

    const desbordeAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // `inert` retira del tabulador y del árbol de accesibilidad todo lo que
    // no es el diálogo.
    //
    // Se sube por los ancestros marcando los HERMANOS de cada nivel, en vez
    // de mirar solo los hijos de #raiz. La primera versión hacía eso último
    // y era un no-op en media aplicación: el tablero devuelve un fragmento
    // —varios hijos de #raiz, y el diálogo es uno de ellos—, pero
    // `Estructura`, que envuelve las cuatro pantallas de /admin, devuelve UN
    // solo <div> con todo dentro. Ahí #raiz tenía un único hijo, que contenía
    // al diálogo, y no se marcaba nada.
    //
    // Nunca se marca un ancestro del propio panel, que lo esconderá también.
    // Y se exceptúa la región viva: es hermana del diálogo, y con ella
    // inerte el aviso «la iniciativa pasó a Radicado» —que se publica
    // justo con el diálogo abierto— no lo lee ningún lector de pantalla.
    const inertes: HTMLElement[] = [];
    let nodo: HTMLElement | null = panel.current;
    while (nodo && nodo.parentElement && nodo !== document.body) {
      for (const hermano of Array.from(nodo.parentElement.children) as HTMLElement[]) {
        if (hermano === nodo) continue;
        if (hermano.contains(panel.current)) continue;
        if (hermano.hasAttribute('data-region-viva')) continue;
        if (hermano.inert) continue;
        hermano.inert = true;
        inertes.push(hermano);
      }
      nodo = nodo.parentElement;
    }

    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = desbordeAnterior;
      inertes.forEach((h) => { h.inert = false; });
      (abridor.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Confirmación de descarte: es un diálogo DENTRO de otro, así que necesita
// su propia gestión de foco. Antes se dibujaba en línea y sus botones se
// añadían al final de la lista de enfocables del panel: el foco se quedaba
// en el formulario oscurecido y había que tabular por los nueve controles
// tapados para llegar a «Seguir diligenciando». Y un segundo Escape lo
// reabría en vez de cerrarlo.
//
// Va en un componente aparte porque el gancho no puede llamarse dentro de
// una rama condicional del padre.
function ConfirmarDescarte({ onSeguir, onDescartar }: {
  onSeguir: () => void; onDescartar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  // Escape aquí vuelve al formulario, no cierra la hoja entera.
  useDialogo(caja, onSeguir);

  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-t-2xl bg-navy-900/60 p-5 sm:rounded-caja">
      <div
        ref={caja}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label="Confirmar que desea descartar"
        className="w-full max-w-xs rounded-caja bg-panel p-4 outline-none"
      >
        <p className="mb-1 text-[14.5px] font-bold">¿Descartar lo que escribió?</p>
        <p className="mb-4 text-[13px] leading-relaxed text-tenue">
          Si cierra ahora se pierde lo que lleva diligenciado.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" tamano="chico" onClick={onSeguir}>
            Seguir diligenciando
          </Boton>
          <Boton variante="peligro" tamano="chico" onClick={onDescartar}>
            Descartar
          </Boton>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Hoja/diálogo.
//
// En móvil es una hoja que sube desde abajo, y ahí había dos problemas
// serios: el pie iba dentro del mismo contenedor desplazable, así que el
// botón principal quedaba al final del recorrido y el teclado virtual lo
// tapaba; y un toque en el fondo cerraba sin preguntar, tirando un
// formulario largo a medio llenar.
//
// Ahora el cuerpo es lo único que se desplaza y el pie queda fijo abajo.
// `cierreSeguro` pide confirmación antes de descartar; se usa donde hay
// datos que perder.
// =====================================================================
export function Modal({ titulo, descripcion, children, onCerrar, pie, alTocarFuera = 'cerrar' }: {
  titulo: string; descripcion?: string; children: ReactNode; onCerrar: () => void; pie?: ReactNode;
  // Qué pasa al tocar el fondo oscuro o pulsar Escape:
  //   'cerrar'    cierra sin más (el caso corriente)
  //   'confirmar' pregunta antes de descartar (formularios con datos)
  //   'ignorar'   no cierra (pantallas cuyo contenido no se puede recuperar,
  //               como el código de trámite: un roce lo destruía para siempre)
  alTocarFuera?: 'cerrar' | 'confirmar' | 'ignorar';
}) {
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Tocar el fondo oscuro. Aquí sí manda `alTocarFuera`: es el gesto que se
  // hace sin querer, con el pulgar, y el que puede tirar un formulario largo
  // o destruir el código de trámite.
  function alFondo() {
    if (alTocarFuera === 'ignorar') return;
    if (alTocarFuera === 'confirmar') { setConfirmandoCierre(true); return; }
    onCerrar();
  }

  // Escape es otra cosa: una pulsación deliberada y dirigida, no un roce.
  // Por eso cierra incluso donde el fondo se ignora. Atarlo a `alTocarFuera`
  // dejaba la pantalla del código sin salida por teclado, y eso es un
  // criterio A (WCAG 2.1.2, sin trampas de teclado).
  function porTeclado() {
    if (alTocarFuera === 'confirmar') { setConfirmandoCierre(true); return; }
    onCerrar();
  }

  // Foco, trampa de foco, Escape e `inert`: mismo comportamiento que el
  // panel de flujo del tablero, definido una sola vez.
  useDialogo(panel, porTeclado);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/70 p-0 sm:items-center sm:p-6"
      onClick={alFondo}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // `dvh` se declara después de `vh` para que gane donde exista: `vh`
        // no encoge al abrirse el teclado virtual y la hoja se queda más
        // alta que la ventana, con el pie fuera de alcance.
        style={{ maxHeight: '92vh' }}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-panel outline-none sm:rounded-caja"
      >
        <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="titulo mb-1 text-[17px]">{titulo}</h2>
          {descripcion && <p className="text-[13.5px] leading-relaxed text-tenue">{descripcion}</p>}
        </div>

        {/* Lo único que se desplaza. overscroll-contain evita que al llegar
            al final el gesto arrastre la página de detrás. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>

        {pie && (
          <div
            className="shrink-0 border-t border-linea bg-panel px-5 py-4 sm:px-6"
            // La barra de gestos del teléfono tapa el botón si no se deja aire.
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{pie}</div>
          </div>
        )}

        {confirmandoCierre && (
          <ConfirmarDescarte
            onSeguir={() => setConfirmandoCierre(false)}
            onDescartar={onCerrar}
          />
        )}
      </div>
    </div>
  );
}
