// =====================================================================
// Cliente de API.
//
// En producción corre contra el servidor real. El simulador en memoria que
// hay más abajo se conserva porque es lo que da datos deterministas a las
// pruebas: jsdom no tiene servidor detrás, y sin datos la mitad de las
// comprobaciones fallan por falta de contenido y no por un defecto.
//
// El interruptor NO se edita a mano. Lo fija el build:
//   · vite.config.ts       (producción)  -> API real
//   · vite.test.config.mjs (pruebas)     -> simulador, con sesión sembrada
// Cambiarlo a mano y olvidar restaurarlo publica una interfaz que no habla
// con la base, y eso no se nota hasta que alguien intenta guardar.
// =====================================================================
import type {
  Direccion, Estado, Iniciativa, Movimiento, Permiso, Rol, Usuario,
  Sesion, EstadisticaEstado, Transicion, Responsable, Alcance, ColorEstado, CamposEditables,
} from './tipos';

const USAR_SIMULADO = import.meta.env.VITE_SIMULADO === '1';
const BASE = '/api';

export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string, public codigo?: string) {
    super(mensaje);
  }
}

// Estado 0: no hubo respuesta del servidor. Se distingue del 401 a
// propósito. Si se tratan igual, una caída de red o de MySQL se le
// presenta al funcionario como «le cerraron la sesión», y se pone a
// buscar sus credenciales en vez de avisar de que el servidor no está.
export const SIN_CONEXION = 0;

async function pedirReal<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + ruta, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opciones,
    });
  } catch {
    throw new ErrorApi(
      SIN_CONEXION,
      'No hay conexión con el servidor. Revise su red y vuelva a intentarlo.',
    );
  }
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    throw new ErrorApi(res.status, cuerpo.error ?? `Error ${res.status}`, cuerpo.codigo);
  }
  return res.status === 204 ? (null as T) : res.json();
}

// ---------------------------------------------------------------------
// Datos del simulador
// ---------------------------------------------------------------------
const PERMISOS: Permiso[] = [
  { id: 1, clave: 'iniciativas.ver', nombre: 'Ver iniciativas', descripcion: 'Consultar el tablero de su dirección', grupo: 'Iniciativas', orden: 1 },
  { id: 2, clave: 'iniciativas.ver_todas', nombre: 'Ver todas las direcciones', descripcion: 'Consultar el tablero completo', grupo: 'Iniciativas', orden: 2 },
  { id: 3, clave: 'iniciativas.crear', nombre: 'Crear iniciativas', descripcion: 'Registrar nuevas iniciativas', grupo: 'Iniciativas', orden: 3 },
  { id: 4, clave: 'iniciativas.editar', nombre: 'Editar iniciativas', descripcion: 'Modificar nombre, objeto y prioridad', grupo: 'Iniciativas', orden: 4 },
  { id: 5, clave: 'iniciativas.eliminar', nombre: 'Eliminar iniciativas', descripcion: 'Dar de baja una iniciativa', grupo: 'Iniciativas', orden: 5 },
  { id: 6, clave: 'iniciativas.exportar', nombre: 'Exportar a CSV', descripcion: 'Descargar el listado completo', grupo: 'Iniciativas', orden: 6 },
  { id: 7, clave: 'documentos.gestionar', nombre: 'Gestionar documentos', descripcion: 'Agregar y quitar enlaces', grupo: 'Iniciativas', orden: 7 },
  { id: 8, clave: 'flujo.mover', nombre: 'Mover de estado', descripcion: 'Avanzar, devolver, rechazar o cerrar', grupo: 'Flujo', orden: 1 },
  { id: 9, clave: 'flujo.acotar', nombre: 'Acotar el alcance', descripcion: 'Modificar el objeto con constancia', grupo: 'Flujo', orden: 2 },
  { id: 10, clave: 'flujo.ver_historial', nombre: 'Ver historial', descripcion: 'Consultar la trazabilidad', grupo: 'Flujo', orden: 3 },
  { id: 11, clave: 'flujo.configurar', nombre: 'Configurar el flujo', descripcion: 'Definir estados y visibilidad', grupo: 'Flujo', orden: 4 },
  { id: 12, clave: 'usuarios.ver', nombre: 'Ver usuarios', descripcion: 'Consultar el directorio', grupo: 'Administración', orden: 1 },
  { id: 13, clave: 'usuarios.administrar', nombre: 'Administrar usuarios', descripcion: 'Crear, editar y desactivar cuentas', grupo: 'Administración', orden: 2 },
  { id: 14, clave: 'usuarios.aprobar', nombre: 'Aprobar registros', descripcion: 'Habilitar cuentas autorregistradas', grupo: 'Administración', orden: 3 },
  { id: 15, clave: 'roles.administrar', nombre: 'Administrar roles', descripcion: 'Crear roles y asignar permisos', grupo: 'Administración', orden: 4 },
  { id: 16, clave: 'estadisticas.ver', nombre: 'Ver estadísticas', descripcion: 'Acceder al panel de indicadores', grupo: 'Administración', orden: 5 },
];

const TODOS = PERMISOS.map((p) => p.clave);

let roles: Rol[] = [
  { id: 1, clave: 'lector', nombre: 'Lector', descripcion: 'Consulta el tablero, sin modificar nada', es_sistema: true, activo: true, usuarios: 3, permisos: ['iniciativas.ver'] },
  { id: 2, clave: 'editor', nombre: 'Editor', descripcion: 'Registra y actualiza las iniciativas de su dirección', es_sistema: true, activo: true, usuarios: 6, permisos: ['iniciativas.ver', 'iniciativas.crear', 'iniciativas.editar', 'iniciativas.eliminar', 'iniciativas.exportar', 'documentos.gestionar', 'flujo.mover', 'flujo.ver_historial'] },
  { id: 3, clave: 'director', nombre: 'Director', descripcion: 'Su dirección, más consulta de todas y estadísticas', es_sistema: true, activo: true, usuarios: 5, permisos: ['iniciativas.ver', 'iniciativas.ver_todas', 'iniciativas.crear', 'iniciativas.editar', 'iniciativas.eliminar', 'iniciativas.exportar', 'documentos.gestionar', 'flujo.mover', 'flujo.acotar', 'flujo.ver_historial', 'usuarios.ver', 'estadisticas.ver'] },
  { id: 4, clave: 'viceministro', nombre: 'Viceministro', descripcion: 'Acceso completo a iniciativas y flujo', es_sistema: true, activo: true, usuarios: 1, permisos: TODOS.filter((c) => c !== 'roles.administrar') },
  { id: 5, clave: 'administrador', nombre: 'Administrador', descripcion: 'Gestiona usuarios, roles y configuración', es_sistema: true, activo: true, usuarios: 1, permisos: ['iniciativas.ver', 'iniciativas.ver_todas', 'flujo.ver_historial', 'flujo.configurar', 'usuarios.ver', 'usuarios.administrar', 'usuarios.aprobar', 'roles.administrar', 'estadisticas.ver'] },
  { id: 6, clave: 'secretaria_juridica', nombre: 'Secretaría Jurídica', descripcion: 'Revisa conceptos jurídicos antes de radicar', es_sistema: false, activo: true, usuarios: 2, permisos: ['iniciativas.ver', 'iniciativas.ver_todas', 'flujo.acotar', 'flujo.ver_historial', 'estadisticas.ver'] },
];

let estados: Estado[] = [
  { id: 1, clave: 'formulacion', nombre: 'En formulación', color: 'gris', orden: 1, es_inicial: true, es_final: false, activo: true, visibilidad: 'direccion', iniciativas: 4, responsables_activos: 3 },
  { id: 2, clave: 'concepto', nombre: 'En concepto jurídico', color: 'morado', orden: 2, es_inicial: false, es_final: false, activo: true, visibilidad: 'responsables', iniciativas: 2, responsables_activos: 2 },
  { id: 3, clave: 'radicado', nombre: 'Radicado', color: 'azul', orden: 3, es_inicial: false, es_final: false, activo: true, visibilidad: 'autenticado', iniciativas: 3, responsables_activos: 4 },
  { id: 4, clave: 'comision', nombre: 'En comisión', color: 'ambar', orden: 4, es_inicial: false, es_final: false, activo: true, visibilidad: 'autenticado', iniciativas: 2, responsables_activos: 0 },
  { id: 5, clave: 'aprobado', nombre: 'Aprobado', color: 'verde', orden: 5, es_inicial: false, es_final: true, activo: true, visibilidad: 'publico', iniciativas: 1, responsables_activos: 2 },
  { id: 6, clave: 'archivado', nombre: 'Archivado', color: 'rojo', orden: 6, es_inicial: false, es_final: true, activo: true, visibilidad: 'autenticado', iniciativas: 2, responsables_activos: 2 },
];

const direcciones: Direccion[] = [
  { id: 'dialogo', nombre: 'Dirección de Diálogo Social', nombre_corto: 'Diálogo Social', descripcion: 'Coordinación de espacios de interlocución con actores sociales y territoriales.', total_iniciativas: 2 },
  { id: 'indigenas', nombre: 'Dirección de Asuntos Indígenas, ROM y Minorías', nombre_corto: 'Asuntos Indígenas', descripcion: 'Concertación normativa con pueblos indígenas y ROM.', total_iniciativas: 2 },
  { id: 'ddhh', nombre: 'Dirección de Derechos Humanos', nombre_corto: 'Derechos Humanos', descripcion: 'Política nacional integral de DD.HH. y DIH, garantías para líderes sociales y personas defensoras.', total_iniciativas: 6 },
  { id: 'religiosos', nombre: 'Dirección de Asuntos Religiosos', nombre_corto: 'Asuntos Religiosos', descripcion: 'Garantía del derecho a la libertad religiosa y de cultos.', total_iniciativas: 1 },
  { id: 'negras', nombre: 'Dirección de Asuntos para Comunidades Negras', nombre_corto: 'Comunidades Negras', descripcion: 'Desarrollo normativo de los derechos de las comunidades negras, afrocolombianas, raizales y palenqueras.', total_iniciativas: 2 },
  { id: 'consulta', nombre: 'Dirección de la Autoridad Nacional de Consulta Previa', nombre_corto: 'Consulta Previa', descripcion: 'Garantía del derecho fundamental a la consulta previa.', total_iniciativas: 1 },
];

const est = (id: number) => estados.find((e) => e.id === id)!;

function nuevaIniciativa(
  id: number, direccion_id: string, nombre: string, objeto: string,
  numero: string, estadoId: number, prioridad: 'Alta' | 'Media' | 'Baja',
  fecha: string, extra: Partial<Iniciativa> = {},
): Iniciativa {
  const e = est(estadoId);
  return {
    id, direccion_id, nombre, objeto, numero_proyecto: numero,
    estado: e.nombre, estado_id: e.id, estado_clave: e.clave,
    estado_color: e.color, visibilidad: e.visibilidad,
    prioridad, fecha_actualizacion: fecha, fuente_publica: false,
    origen: 'interna', propuesta_por: null, propuesta_nombre: '',
    total_documentos: 0, total_movimientos: 0, ...extra,
  };
}

let iniciativas: Iniciativa[] = [
  nuevaIniciativa(1, 'ddhh', 'Proyecto de ley de garantías para personas defensoras de derechos humanos', 'Fortalecer las medidas de protección y el sistema de alertas tempranas', 'PL 214/2026C', 4, 'Alta', '2026-08-19', { fuente_publica: true, total_documentos: 2, total_movimientos: 5 }),
  nuevaIniciativa(2, 'ddhh', 'Acto legislativo sobre jurisdicción agraria', 'Ajustes al articulado en trámite de segunda vuelta', 'AL 08/2026S', 3, 'Media', '2026-08-05', { total_documentos: 1, total_movimientos: 3 }),
  nuevaIniciativa(3, 'ddhh', 'Decreto reglamentario de la política pública de DD.HH. y DIH', 'Reglamentación del capítulo de garantías para liderazgos sociales', '', 2, 'Alta', '2026-08-21', { total_movimientos: 2 }),
  nuevaIniciativa(4, 'ddhh', 'Proyecto de ley estatutaria de protesta social', 'Desarrollo del derecho a la reunión y manifestación pública', 'PL 073/2025C', 6, 'Baja', '2026-06-30', { fuente_publica: true, total_movimientos: 4 }),
  nuevaIniciativa(5, 'ddhh', 'Proyecto de ley de protección a líderes comunales', 'Ampliar el esquema de protección a juntas de acción comunal', '', 1, 'Media', '2026-08-23', { origen: 'propuesta', propuesta_por: 5, propuesta_nombre: 'Marta Ospina', total_movimientos: 1 }),
  nuevaIniciativa(6, 'ddhh', 'Decreto de rutas de atención para denunciantes de amenazas', '', '', 1, 'Media', '2026-08-22', { origen: 'propuesta', propuesta_por: null, propuesta_nombre: 'Jorge Beltrán', total_movimientos: 1 }),
  nuevaIniciativa(7, 'consulta', 'Decreto de protocolización con comunidades étnicas del Pacífico', 'Formalización de los acuerdos de consulta previa', '', 5, 'Alta', '2026-08-14', { total_movimientos: 6 }),
  nuevaIniciativa(8, 'indigenas', 'Decreto de concertación con la Mesa Permanente de Concertación', 'Ruta de protocolización con pueblos indígenas', 'D-1811/2026', 4, 'Alta', '2026-08-20', { total_documentos: 1, total_movimientos: 4 }),
  nuevaIniciativa(9, 'indigenas', 'Ajuste al Decreto 1811 sobre consulta a pueblos ROM', '', '', 1, 'Baja', '2026-07-30', {}),
  nuevaIniciativa(10, 'dialogo', 'Proyecto de ley de participación ciudadana territorial', '', '', 3, 'Media', '2026-08-11', { total_movimientos: 2 }),
  nuevaIniciativa(11, 'dialogo', 'Mesa territorial de diálogo en el Catatumbo', 'Formalización del espacio de interlocución', '', 1, 'Media', '2026-08-24', { origen: 'propuesta', propuesta_por: 5, propuesta_nombre: 'Marta Ospina' }),
  nuevaIniciativa(12, 'negras', 'Reforma al Capítulo IV de la Ley 70 de 1993', 'Actualización de los mecanismos de participación', 'PL 156/2026C', 3, 'Alta', '2026-08-16', { total_movimientos: 3 }),
  nuevaIniciativa(13, 'negras', 'Decreto de titulación colectiva en el Pacífico sur', '', '', 2, 'Media', '2026-08-18', { total_movimientos: 1 }),
  nuevaIniciativa(14, 'religiosos', 'Decreto del Sistema Nacional de Libertad Religiosa', '', '', 6, 'Media', '2026-07-28', { total_movimientos: 3 }),
];

let documentos: { id: number; iniciativa_id: number; nombre: string; enlace: string; fecha: string | null }[] = [
  { id: 1, iniciativa_id: 1, nombre: 'Exposición de motivos', enlace: 'https://drive.google.com/ejemplo1', fecha: '2026-08-12' },
  { id: 2, iniciativa_id: 1, nombre: 'Concepto de la Secretaría Jurídica', enlace: 'https://drive.google.com/ejemplo2', fecha: '2026-08-18' },
  { id: 3, iniciativa_id: 2, nombre: 'Texto radicado', enlace: 'https://drive.google.com/ejemplo3', fecha: '2026-08-05' },
  { id: 4, iniciativa_id: 8, nombre: 'Acta de la Mesa Permanente', enlace: 'https://drive.google.com/ejemplo4', fecha: '2026-08-20' },
];

let usuarios: Usuario[] = [
  { id: 1, nombre: 'Carlos Mejía', correo: 'carlos.mejia@mininterior.gov.co', direccion_id: null, direccion_nombre: null, rol_id: 4, rol_nombre: 'Viceministro', rol_clave: 'viceministro', activo: true, pendiente_aprobacion: false, ultimo_ingreso: '2026-08-25 08:12', registrado_en: null },
  { id: 2, nombre: 'Ana Restrepo', correo: 'ana.restrepo@mininterior.gov.co', direccion_id: 'ddhh', direccion_nombre: 'Derechos Humanos', rol_id: 2, rol_nombre: 'Editor', rol_clave: 'editor', activo: true, pendiente_aprobacion: false, ultimo_ingreso: '2026-08-25 07:40', registrado_en: null },
  { id: 3, nombre: 'Sofía Guerrero', correo: 'sofia.guerrero@mininterior.gov.co', direccion_id: 'consulta', direccion_nombre: 'Consulta Previa', rol_id: 3, rol_nombre: 'Director', rol_clave: 'director', activo: true, pendiente_aprobacion: false, ultimo_ingreso: '2026-08-24 16:05', registrado_en: null },
  { id: 4, nombre: 'Luis Cardona', correo: 'luis.cardona@mininterior.gov.co', direccion_id: 'dialogo', direccion_nombre: 'Diálogo Social', rol_id: 2, rol_nombre: 'Editor', rol_clave: 'editor', activo: true, pendiente_aprobacion: false, ultimo_ingreso: '2026-08-22 11:30', registrado_en: null },
  { id: 5, nombre: 'Marta Ospina', correo: 'marta.ospina@correo.com', direccion_id: null, direccion_nombre: null, rol_id: 1, rol_nombre: 'Lector', rol_clave: 'lector', activo: true, pendiente_aprobacion: true, ultimo_ingreso: '2026-08-24 09:15', registrado_en: '2026-08-23 14:22' },
  { id: 6, nombre: 'Jorge Beltrán', correo: 'jorge.beltran@correo.com', direccion_id: null, direccion_nombre: null, rol_id: 1, rol_nombre: 'Lector', rol_clave: 'lector', activo: true, pendiente_aprobacion: true, ultimo_ingreso: null, registrado_en: '2026-08-22 18:03' },
  { id: 7, nombre: 'Diana Salcedo', correo: 'diana.salcedo@mininterior.gov.co', direccion_id: 'negras', direccion_nombre: 'Comunidades Negras', rol_id: 6, rol_nombre: 'Secretaría Jurídica', rol_clave: 'secretaria_juridica', activo: true, pendiente_aprobacion: false, ultimo_ingreso: '2026-08-25 09:02', registrado_en: null },
  { id: 8, nombre: 'Hernán Prieto', correo: 'hernan.prieto@mininterior.gov.co', direccion_id: 'indigenas', direccion_nombre: 'Asuntos Indígenas', rol_id: 1, rol_nombre: 'Lector', rol_clave: 'lector', activo: false, pendiente_aprobacion: false, ultimo_ingreso: '2026-05-14 10:11', registrado_en: null },
  { id: 9, nombre: 'Administrador del Sistema', correo: 'admin@mininterior.gov.co', direccion_id: null, direccion_nombre: null, rol_id: 5, rol_nombre: 'Administrador', rol_clave: 'administrador', activo: true, pendiente_aprobacion: false, ultimo_ingreso: '2026-08-25 10:00', registrado_en: null },
];

const historial: Record<number, Movimiento[]> = {
  1: [
    { id: 5, tipo: 'acotar', motivo: 'Se excluye el capítulo presupuestal por concepto de Hacienda', valor_anterior: 'Fortalecer las medidas de protección, el sistema de alertas tempranas y el presupuesto de la Unidad Nacional de Protección', valor_nuevo: 'Fortalecer las medidas de protección y el sistema de alertas tempranas', creado_en: '2026-08-19 15:40', usuario: 'Diana Salcedo', estado_anterior: 'En comisión', estado_nuevo: 'En comisión' },
    { id: 4, tipo: 'avanzar', motivo: null, valor_anterior: null, valor_nuevo: null, creado_en: '2026-08-14 10:22', usuario: 'Ana Restrepo', estado_anterior: 'Radicado', estado_nuevo: 'En comisión' },
    { id: 3, tipo: 'devolver', motivo: 'Falta el concepto de la Secretaría Jurídica sobre el artículo 7', valor_anterior: null, valor_nuevo: null, creado_en: '2026-08-08 09:05', usuario: 'Carlos Mejía', estado_anterior: 'Radicado', estado_nuevo: 'En concepto jurídico' },
    { id: 2, tipo: 'avanzar', motivo: null, valor_anterior: null, valor_nuevo: null, creado_en: '2026-07-30 14:50', usuario: 'Ana Restrepo', estado_anterior: 'En formulación', estado_nuevo: 'Radicado' },
    { id: 1, tipo: 'creacion', motivo: null, valor_anterior: null, valor_nuevo: null, creado_en: '2026-07-12 08:30', usuario: 'Ana Restrepo', estado_anterior: null, estado_nuevo: 'En formulación' },
  ],
};

const responsables: Record<number, Responsable[]> = {
  1: [
    { usuario_id: 2, nombre: 'Ana Restrepo', puede_avanzar: true, puede_devolver: true, puede_rechazar: false, puede_cerrar: false, puede_acotar: false },
    { usuario_id: 4, nombre: 'Luis Cardona', puede_avanzar: true, puede_devolver: true, puede_rechazar: false, puede_cerrar: false, puede_acotar: false },
    { usuario_id: 1, nombre: 'Carlos Mejía', puede_avanzar: true, puede_devolver: true, puede_rechazar: true, puede_cerrar: true, puede_acotar: true },
  ],
  2: [
    { usuario_id: 7, nombre: 'Diana Salcedo', puede_avanzar: true, puede_devolver: true, puede_rechazar: false, puede_cerrar: false, puede_acotar: true },
    { usuario_id: 1, nombre: 'Carlos Mejía', puede_avanzar: true, puede_devolver: true, puede_rechazar: true, puede_cerrar: true, puede_acotar: true },
  ],
  3: [
    { usuario_id: 2, nombre: 'Ana Restrepo', puede_avanzar: true, puede_devolver: true, puede_rechazar: false, puede_cerrar: false, puede_acotar: false },
    { usuario_id: 3, nombre: 'Sofía Guerrero', puede_avanzar: true, puede_devolver: true, puede_rechazar: true, puede_cerrar: false, puede_acotar: false },
    { usuario_id: 4, nombre: 'Luis Cardona', puede_avanzar: true, puede_devolver: false, puede_rechazar: false, puede_cerrar: false, puede_acotar: false },
    { usuario_id: 1, nombre: 'Carlos Mejía', puede_avanzar: true, puede_devolver: true, puede_rechazar: true, puede_cerrar: true, puede_acotar: true },
  ],
  4: [],
  5: [
    { usuario_id: 1, nombre: 'Carlos Mejía', puede_avanzar: true, puede_devolver: true, puede_rechazar: true, puede_cerrar: true, puede_acotar: true },
    { usuario_id: 3, nombre: 'Sofía Guerrero', puede_avanzar: false, puede_devolver: false, puede_rechazar: false, puede_cerrar: true, puede_acotar: false },
  ],
  6: [
    { usuario_id: 1, nombre: 'Carlos Mejía', puede_avanzar: true, puede_devolver: true, puede_rechazar: true, puede_cerrar: true, puede_acotar: true },
    { usuario_id: 3, nombre: 'Sofía Guerrero', puede_avanzar: true, puede_devolver: true, puede_rechazar: false, puede_cerrar: true, puede_acotar: false },
  ],
};

// El flujo configurado: avance secuencial, devolución y rechazo.
const transiciones: { origen: number; destino: number; tipo: Transicion['tipo']; etiqueta: string; motivo: boolean }[] = [
  { origen: 1, destino: 2, tipo: 'avanzar', etiqueta: 'Enviar a concepto jurídico', motivo: false },
  { origen: 1, destino: 6, tipo: 'rechazar', etiqueta: 'Rechazar', motivo: true },
  { origen: 2, destino: 3, tipo: 'avanzar', etiqueta: 'Radicar', motivo: false },
  { origen: 2, destino: 1, tipo: 'devolver', etiqueta: 'Devolver a formulación', motivo: true },
  { origen: 3, destino: 4, tipo: 'avanzar', etiqueta: 'Enviar a comisión', motivo: false },
  { origen: 3, destino: 2, tipo: 'devolver', etiqueta: 'Devolver a concepto', motivo: true },
  { origen: 3, destino: 6, tipo: 'rechazar', etiqueta: 'Rechazar', motivo: true },
  { origen: 4, destino: 5, tipo: 'avanzar', etiqueta: 'Aprobar', motivo: false },
  { origen: 4, destino: 3, tipo: 'devolver', etiqueta: 'Devolver a radicación', motivo: true },
  { origen: 4, destino: 6, tipo: 'rechazar', etiqueta: 'Rechazar', motivo: true },
  { origen: 5, destino: 6, tipo: 'cerrar', etiqueta: 'Cerrar y archivar', motivo: false },
];

// El simulador arranca sin sesión, como el sistema real. El build de
// pruebas puede sembrar una para poder comprobar las pantallas que exigen
// permisos, que de otro modo no se dibujan.
let sesion: Sesion | null = import.meta.env.VITE_SESION_PRUEBA === '1'
  ? {
      id: 1, nombre: 'Usuario de prueba', correo: 'pruebas@example.invalid',
      direccion_id: null, rol_nombre: 'Administrador',
      permisos: [...TODOS], pendiente_aprobacion: false,
      debe_cambiar: false,
    }
  : null;
const tokensRecuperacion: Record<string, { correo: string; expira: number }> = {};
let configuracion = { exigir_aprobacion_manual: true };

const esperar = (ms = 260) => new Promise((r) => setTimeout(r, ms));

function recalcularConteos() {
  estados = estados.map((e) => ({
    ...e,
    iniciativas: iniciativas.filter((i) => i.estado_id === e.id).length,
    responsables_activos: (responsables[e.id] ?? []).length,
  }));
  roles = roles.map((r) => ({ ...r, usuarios: usuarios.filter((u) => u.rol_id === r.id && u.activo).length }));
}

// =====================================================================
// API pública
// =====================================================================
export const api = {
  async sesion(): Promise<Sesion | null> {
    if (!USAR_SIMULADO) {
      try {
        const res = await pedirReal<{ usuario: Sesion }>('/auth/sesion');
        return res?.usuario ?? null;
      } catch (e) {
        // Solo un 401 significa «no hay sesión». Cualquier otro error
        // —servidor caído, base de datos caída, red— se propaga, para
        // que la pantalla pueda decir qué pasó en vez de dibujar un
        // tablero vacío como si el usuario no hubiera entrado.
        if (e instanceof ErrorApi && e.estado === 401) return null;
        throw e;
      }
    }
    await esperar(80);
    return sesion;
  },

  async ingresar(correo: string, contrasena: string): Promise<Sesion> {
    if (!USAR_SIMULADO) {
      const res = await pedirReal<{ usuario: Sesion }>('/auth/ingresar', {
        method: 'POST',
        body: JSON.stringify({ correo, contrasena }),
      });
      return res.usuario;
    }
    await esperar(250);
    const c = correo.trim().toLowerCase();
    const u = usuarios.find((x) => x.correo.toLowerCase() === c);
    if (!u || !u.activo) {
      throw new ErrorApi(401, 'Correo o contraseña incorrectos');
    }
    const rol = roles.find((r) => r.id === u.rol_id) ?? roles[0];
    sesion = {
      id: u.id,
      nombre: u.nombre,
      correo: u.correo,
      direccion_id: u.direccion_id,
      rol_nombre: rol.nombre,
      permisos: [...rol.permisos],
      pendiente_aprobacion: u.pendiente_aprobacion,
      debe_cambiar: false,
    };
    return sesion;
  },

  async salir(): Promise<void> {
    if (!USAR_SIMULADO) {
      try {
        await pedirReal('/auth/salir', { method: 'POST' });
      } catch {
        // Ignorar error si la sesión ya no existía
      }
      return;
    }
    await esperar(100);
    sesion = null;
  },

  // El servidor responde lo mismo exista o no la cuenta, para no
  // permitir averiguar qué correos están registrados. Y solo devuelve
  // `token` y `enlace` si la máquina lo autoriza expresamente
  // (RECUPERACION_ENLACE_EN_RESPUESTA=1, para trabajar en local): sin
  // envío de correo, devolverlos siempre convierte la recuperación en
  // una toma de cuenta. Por eso los dos campos son opcionales.
  async solicitarRecuperacion(
    correo: string,
  ): Promise<{ mensaje: string; token?: string; enlace?: string }> {
    if (!USAR_SIMULADO) {
      return pedirReal('/auth/solicitar-recuperacion', {
        method: 'POST',
        body: JSON.stringify({ correo }),
      });
    }
    await esperar(300);
    const c = correo.trim().toLowerCase();
    const u = usuarios.find((x) => x.correo.toLowerCase() === c);
    const mensaje = 'Si el correo corresponde a una cuenta registrada, le enviaremos las '
                  + 'instrucciones para restablecer la contraseña.';
    if (!u) return { mensaje };

    const token = 'tok_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    tokensRecuperacion[token] = {
      correo: u.correo,
      expira: Date.now() + 3600 * 1000,
    };
    const origen = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5173';
    return { mensaje, token, enlace: `${origen}/?recuperar=${token}` };
  },

  async restablecerContrasena(token: string, nuevaContrasena: string): Promise<{ correo: string }> {
    if (!USAR_SIMULADO) {
      return pedirReal('/auth/restablecer-contrasena', {
        method: 'POST',
        body: JSON.stringify({ token, nuevaContrasena }),
      });
    }
    await esperar(350);
    if (nuevaContrasena.length < 12) {
      throw new ErrorApi(400, 'La nueva contraseña debe tener al menos 12 caracteres');
    }
    if (!/[0-9]/.test(nuevaContrasena)) {
      throw new ErrorApi(400, 'La nueva contraseña debe incluir al menos un número');
    }

    const datosToken = tokensRecuperacion[token];
    if (!datosToken || datosToken.expira < Date.now()) {
      throw new ErrorApi(400, 'El enlace de recuperación es inválido o ha expirado. Solicite uno nuevo.');
    }
    const u = usuarios.find((x) => x.correo.toLowerCase() === datosToken.correo.toLowerCase());
    if (!u) throw new ErrorApi(404, 'Usuario no encontrado');

    delete tokensRecuperacion[token];
    return { correo: u.correo };
  },

  // Cambiar la propia contraseña estando dentro. El endpoint existía desde
  // la migración 04 y **ninguna pantalla lo llamaba**, así que quien
  // recibía una contraseña provisional quedaba en solo lectura para
  // siempre: `debe_cambiar` bloquea toda escritura y no había forma de
  // quitárselo. Y como `npm run crear-usuario` deja precisamente esa
  // marca, una instalación nueva nacía sin nadie que pudiera escribir.
  async cambiarContrasena(actual: string, nueva: string): Promise<void> {
    if (!USAR_SIMULADO) {
      await pedirReal('/auth/cambiar-contrasena', {
        method: 'POST',
        body: JSON.stringify({ actual, nueva }),
      });
      return;
    }
    await esperar(300);
    // Las mismas reglas que valida el servidor en auth/contrasena.js, para
    // que el simulador no acepte lo que la API real rechazaría.
    if (nueva.length < 12) {
      throw new ErrorApi(400, 'La contraseña debe tener al menos 12 caracteres');
    }
    if (!/[a-záéíóúñ]/i.test(nueva)) {
      throw new ErrorApi(400, 'La contraseña debe incluir letras');
    }
    if (!/[0-9]/.test(nueva)) {
      throw new ErrorApi(400, 'La contraseña debe incluir al menos un número');
    }
    if (nueva === actual) {
      throw new ErrorApi(400, 'La nueva contraseña debe ser distinta de la actual');
    }
    if (!actual) {
      throw new ErrorApi(401, 'La contraseña actual no es correcta');
    }
    if (sesion) sesion.debe_cambiar = false;
  },

  // `cambiarUsuario` se retiró junto con el desplegable «Ver la aplicación
  // como» de /admin. Era el único método de este archivo sin rama contra la
  // API real, y lo único que hacía era reescribir la sesión del navegador:
  // el servidor seguía viendo a la persona de verdad. Ver ui/estructura.tsx.

  async direcciones(): Promise<Direccion[]> {
    if (!USAR_SIMULADO) return pedirReal('/direcciones');
    await esperar();
    return direcciones.map((d) => ({
      ...d, total_iniciativas: iniciativas.filter((i) => i.direccion_id === d.id).length,
    }));
  },

  async iniciativas(direccionId?: string): Promise<Iniciativa[]> {
    if (!USAR_SIMULADO) return pedirReal(`/iniciativas${direccionId ? `?direccion_id=${direccionId}` : ''}`);
    await esperar();
    return iniciativas
      .filter((i) => !direccionId || i.direccion_id === direccionId)
      .sort((a, b) => b.id - a.id);
  },

  async editarIniciativa(id: number, cambios: Partial<CamposEditables>): Promise<void> {
    if (!USAR_SIMULADO) {
      return pedirReal(`/iniciativas/${id}`, { method: 'PUT', body: JSON.stringify(cambios) });
    }
    await esperar(220);
    const ini = iniciativas.find((i) => i.id === id);
    if (!ini) throw new ErrorApi(404, 'La iniciativa no existe');
    Object.assign(ini, cambios);
  },

  async crearIniciativa(direccionId: string): Promise<{ id: number }> {
    if (!USAR_SIMULADO) {
      return pedirReal('/iniciativas', {
        method: 'POST', body: JSON.stringify({ direccion_id: direccionId, nombre: 'Nueva iniciativa' }),
      });
    }
    await esperar(300);
    const inicial = estados.find((e) => e.es_inicial) ?? estados[0];
    const id = Math.max(...iniciativas.map((i) => i.id)) + 1;
    iniciativas.push(nuevaIniciativa(
      id, direccionId, 'Nueva iniciativa', '', '', inicial.id, 'Media',
      new Date().toISOString().slice(0, 10), { total_movimientos: 1 },
    ));
    recalcularConteos();
    return { id };
  },

  async documentos(iniciativaId: number): Promise<{ id: number; nombre: string; enlace: string; fecha: string | null }[]> {
    if (!USAR_SIMULADO) return pedirReal(`/iniciativas/${iniciativaId}/documentos`);
    await esperar(200);
    return documentos.filter((d) => d.iniciativa_id === iniciativaId);
  },

  async agregarDocumento(iniciativaId: number, d: { nombre: string; enlace: string }): Promise<void> {
    if (!USAR_SIMULADO) {
      return pedirReal(`/iniciativas/${iniciativaId}/documentos`, { method: 'POST', body: JSON.stringify(d) });
    }
    await esperar(280);
    if (!d.nombre.trim()) throw new ErrorApi(400, 'nombre es obligatorio');
    if (d.enlace && !/^https?:\/\//i.test(d.enlace)) {
      throw new ErrorApi(400, 'El enlace debe empezar por http:// o https://');
    }
    documentos.push({
      id: Math.max(0, ...documentos.map((x) => x.id)) + 1,
      iniciativa_id: iniciativaId, nombre: d.nombre.trim(),
      enlace: d.enlace.trim(), fecha: new Date().toISOString().slice(0, 10),
    });
    const ini = iniciativas.find((i) => i.id === iniciativaId);
    if (ini) ini.total_documentos += 1;
  },

  // Se borra por la ruta ANIDADA bajo /iniciativas, no por /api/documentos.
  // La plana existía sin comprobar la dirección —cualquier editor podía
  // recorrer ids y borrar los soportes de otra dirección— y se retiró. Esta
  // pasa por `puedeEditarIniciativa`.
  async eliminarDocumento(iniciativaId: number, documentoId: number): Promise<void> {
    if (!USAR_SIMULADO) {
      return pedirReal(`/iniciativas/${iniciativaId}/documentos/${documentoId}`, { method: 'DELETE' });
    }
    await esperar(200);
    const pos = documentos.findIndex((d) => d.id === documentoId);
    if (pos === -1) throw new ErrorApi(404, 'El documento no existe');
    documentos.splice(pos, 1);
    const ini = iniciativas.find((i) => i.id === iniciativaId);
    if (ini && ini.total_documentos > 0) ini.total_documentos -= 1;
  },

  // La fecha de corte del documento. Sale del servidor porque el tablero se
  // imprime y se radica: con el reloj del navegador, un equipo mal puesto en
  // hora fechaba mal el documento oficial.
  async fechaServidor(): Promise<string> {
    if (!USAR_SIMULADO) {
      const r = await pedirReal<{ fecha: string }>('/salud');
      return r?.fecha ?? new Date().toISOString();
    }
    await esperar(40);
    return new Date().toISOString();
  },

  async estados(): Promise<Estado[]> {
    if (!USAR_SIMULADO) return pedirReal('/admin/estados');
    await esperar();
    recalcularConteos();
    return [...estados].sort((a, b) => a.orden - b.orden);
  },

  async guardarEstado(e: Partial<Estado>): Promise<void> {
    if (!USAR_SIMULADO) {
      if (e.id) {
        return pedirReal(`/admin/estados/${e.id}`, { method: 'PUT', body: JSON.stringify(e) });
      }
      return pedirReal('/admin/estados', { method: 'POST', body: JSON.stringify(e) });
    }
    await esperar();
    if (e.id) {
      estados = estados.map((x) => (x.id === e.id ? { ...x, ...e } : x));
    } else {
      const id = Math.max(...estados.map((x) => x.id)) + 1;
      estados.push({
        id, clave: (e.nombre ?? '').toLowerCase().replace(/\s+/g, '_'),
        nombre: e.nombre ?? '', color: (e.color ?? 'azul') as ColorEstado,
        orden: e.orden ?? estados.length + 1, es_inicial: false,
        es_final: e.es_final ?? false, activo: true,
        visibilidad: (e.visibilidad ?? 'autenticado') as Alcance,
        iniciativas: 0, responsables_activos: 0,
      });
    }
  },

  async transiciones(iniciativaId: number): Promise<Transicion[]> {
    if (!USAR_SIMULADO) return pedirReal(`/iniciativas/${iniciativaId}/transiciones`);
    await esperar(160);
    const ini = iniciativas.find((i) => i.id === iniciativaId);
    if (!ini || !sesion) return [];
    const mias = (responsables[ini.estado_id] ?? []).find((r) => r.usuario_id === sesion!.id);
    if (!mias) return [];
    const puede: Record<Transicion['tipo'], boolean> = {
      avanzar: mias.puede_avanzar, devolver: mias.puede_devolver,
      rechazar: mias.puede_rechazar, cerrar: mias.puede_cerrar,
    };
    return transiciones
      .filter((t) => t.origen === ini.estado_id && puede[t.tipo])
      .map((t, n) => {
        const d = est(t.destino);
        return {
          id: n + 1, tipo: t.tipo, etiqueta: t.etiqueta, requiere_motivo: t.motivo,
          destino_id: d.id, destino_nombre: d.nombre, destino_color: d.color,
        };
      });
  },

  // Se manda la TRANSICIÓN completa, no el estado destino. El servidor
  // resuelve el destino desde ella, que es lo que hace el procedimiento:
  // mandar el id del estado hacía que se interpretara como id de
  // transición y la iniciativa acabara en un estado que nadie pidió.
  // `destinoId`, `tipo` y `clave` se siguen recibiendo porque el simulador
  // los necesita para actualizar su copia en memoria.
  async mover(
    iniciativaId: number,
    transicion: Transicion,
    motivo: string,
  ): Promise<void> {
    if (!USAR_SIMULADO) {
      return pedirReal(`/iniciativas/${iniciativaId}/mover`, {
        method: 'POST',
        body: JSON.stringify({ transicion_id: transicion.id, motivo }),
      });
    }
    const destinoId = transicion.destino_id;
    const tipo = transicion.tipo;
    await esperar();
    const ini = iniciativas.find((i) => i.id === iniciativaId);
    if (!ini) throw new ErrorApi(404, 'La iniciativa no existe');
    const d = est(destinoId);
    const anterior = ini.estado;
    Object.assign(ini, {
      estado_id: d.id, estado: d.nombre, estado_clave: d.clave,
      estado_color: d.color, visibilidad: d.visibilidad,
      fecha_actualizacion: new Date().toISOString().slice(0, 10),
      total_movimientos: ini.total_movimientos + 1,
    });
    historial[iniciativaId] = [
      { id: Date.now(), tipo, motivo: motivo || null, valor_anterior: null, valor_nuevo: null,
        creado_en: new Date().toISOString().slice(0, 16).replace('T', ' '),
        usuario: sesion ? sesion.nombre : 'Usuario del Sistema', estado_anterior: anterior, estado_nuevo: d.nombre },
      ...(historial[iniciativaId] ?? []),
    ];
    recalcularConteos();
  },

  async acotar(iniciativaId: number, nuevoObjeto: string, motivo: string): Promise<void> {
    if (!USAR_SIMULADO) {
      return pedirReal(`/iniciativas/${iniciativaId}/acotar`, {
        method: 'POST',
        body: JSON.stringify({ objeto_nuevo: nuevoObjeto, motivo }),
      });
    }
    await esperar();
    const ini = iniciativas.find((i) => i.id === iniciativaId);
    if (!ini) throw new ErrorApi(404, 'La iniciativa no existe');
    if (!motivo.trim()) throw new ErrorApi(409, 'Debe indicar por qué se acota el alcance');
    const anterior = ini.objeto;
    ini.objeto = nuevoObjeto;
    ini.total_movimientos += 1;
    historial[iniciativaId] = [
      { id: Date.now(), tipo: 'acotar', motivo, valor_anterior: anterior, valor_nuevo: nuevoObjeto,
        creado_en: new Date().toISOString().slice(0, 16).replace('T', ' '),
        usuario: sesion ? sesion.nombre : 'Usuario del Sistema', estado_anterior: ini.estado, estado_nuevo: ini.estado },
      ...(historial[iniciativaId] ?? []),
    ];
  },

  async historial(iniciativaId: number): Promise<Movimiento[]> {
    if (!USAR_SIMULADO) return pedirReal(`/iniciativas/${iniciativaId}/historial`);
    await esperar(200);
    return historial[iniciativaId] ?? [];
  },

  async responsables(estadoId: number): Promise<Responsable[]> {
    if (!USAR_SIMULADO) return pedirReal(`/admin/estados/${estadoId}/responsables`);
    await esperar(180);
    return responsables[estadoId] ?? [];
  },

  async guardarResponsable(estadoId: number, r: Responsable): Promise<void> {
    if (!USAR_SIMULADO) {
      return pedirReal(`/admin/estados/${estadoId}/responsables/${r.usuario_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          avanzar: r.puede_avanzar,
          devolver: r.puede_devolver,
          rechazar: r.puede_rechazar,
          cerrar: r.puede_cerrar,
          acotar: r.puede_acotar,
        }),
      });
    }
    await esperar();
    const lista = responsables[estadoId] ?? (responsables[estadoId] = []);
    const i = lista.findIndex((x) => x.usuario_id === r.usuario_id);
    if (i >= 0) lista[i] = r; else lista.push(r);
    recalcularConteos();
  },

  async quitarResponsable(estadoId: number, usuarioId: number): Promise<void> {
    if (!USAR_SIMULADO) return pedirReal(`/admin/estados/${estadoId}/responsables/${usuarioId}`, { method: 'DELETE' });
    await esperar();
    const lista = responsables[estadoId] ?? [];
    if (lista.length <= 1) {
      throw new ErrorApi(409, 'Ese estado quedaría sin responsables activos. Asigne otro antes de quitarlo.');
    }
    responsables[estadoId] = lista.filter((x) => x.usuario_id !== usuarioId);
    recalcularConteos();
  },

  async usuarios(): Promise<Usuario[]> {
    if (!USAR_SIMULADO) return pedirReal('/admin/usuarios');
    await esperar();
    recalcularConteos();
    return [...usuarios].sort((a, b) =>
      Number(b.pendiente_aprobacion) - Number(a.pendiente_aprobacion) || a.nombre.localeCompare(b.nombre));
  },

  async guardarUsuario(id: number, cambios: Partial<Usuario>): Promise<void> {
    if (!USAR_SIMULADO) return pedirReal(`/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(cambios) });
    await esperar();
    const u = usuarios.find((x) => x.id === id);
    if (!u) throw new ErrorApi(404, 'El usuario no existe');
    if (cambios.rol_id != null) {
      const rol = roles.find((r) => r.id === cambios.rol_id)!;
      cambios.rol_nombre = rol.nombre;
      cambios.rol_clave = rol.clave;
    }
    if (cambios.direccion_id !== undefined) {
      cambios.direccion_nombre = direcciones.find((d) => d.id === cambios.direccion_id)?.nombre_corto ?? null;
    }
    // Misma guarda que el procedimiento: no dejar el sistema sin administrador
    const antes = usuarios.filter((x) => x.activo && roles.find((r) => r.id === x.rol_id)?.permisos.includes('roles.administrar')).length;
    Object.assign(u, cambios);
    const despues = usuarios.filter((x) => x.activo && roles.find((r) => r.id === x.rol_id)?.permisos.includes('roles.administrar')).length;
    if (antes > 0 && despues === 0) {
      Object.assign(u, { rol_id: 5, rol_nombre: 'Administrador', rol_clave: 'administrador' });
      throw new ErrorApi(409, 'No puede dejar el sistema sin ningún administrador de roles');
    }
    recalcularConteos();
  },

  async roles(): Promise<Rol[]> {
    if (!USAR_SIMULADO) return pedirReal('/admin/roles');
    await esperar();
    recalcularConteos();
    return [...roles].sort((a, b) => Number(b.es_sistema) - Number(a.es_sistema) || a.nombre.localeCompare(b.nombre));
  },

  async permisos(): Promise<Permiso[]> {
    if (!USAR_SIMULADO) return pedirReal('/admin/permisos');
    await esperar(180);
    return PERMISOS;
  },

  async guardarRol(rol: { id?: number; nombre: string; descripcion: string; permisos: string[] }): Promise<void> {
    if (!USAR_SIMULADO) {
      if (rol.id) {
        return pedirReal(`/admin/roles/${rol.id}`, { method: 'PUT', body: JSON.stringify(rol) });
      }
      return pedirReal('/admin/roles', { method: 'POST', body: JSON.stringify(rol) });
    }
    await esperar();
    if (!rol.nombre.trim()) throw new ErrorApi(400, 'El rol necesita un nombre');
    if (rol.id) {
      roles = roles.map((r) => (r.id === rol.id ? { ...r, ...rol } : r));
    } else {
      roles.push({
        id: Math.max(...roles.map((r) => r.id)) + 1,
        clave: rol.nombre.toLowerCase().replace(/\s+/g, '_'),
        nombre: rol.nombre, descripcion: rol.descripcion,
        es_sistema: false, activo: true, usuarios: 0, permisos: rol.permisos,
      });
    }
  },

  async eliminarRol(id: number): Promise<void> {
    if (!USAR_SIMULADO) return pedirReal(`/admin/roles/${id}`, { method: 'DELETE' });
    await esperar();
    const r = roles.find((x) => x.id === id);
    if (!r) throw new ErrorApi(404, 'El rol no existe');
    if (r.es_sistema) throw new ErrorApi(409, 'Los roles del sistema no se pueden eliminar');
    if (usuarios.some((u) => u.rol_id === id && u.activo)) {
      throw new ErrorApi(409, 'El rol tiene usuarios asignados. Reasígnelos antes de eliminarlo.');
    }
    roles = roles.filter((x) => x.id !== id);
  },

  async estadisticas(): Promise<EstadisticaEstado[]> {
    if (!USAR_SIMULADO) return pedirReal('/admin/estadisticas/flujo');
    await esperar();
    recalcularConteos();
    const dias: Record<number, number | null> = { 1: 12.4, 2: 21.8, 3: 9.1, 4: 34.6, 5: null, 6: null };
    const entradas: Record<number, number> = { 1: 14, 2: 9, 3: 8, 4: 5, 5: 2, 6: 4 };
    return [...estados].sort((a, b) => a.orden - b.orden).map((e) => ({
      id: e.id, clave: e.clave, nombre: e.nombre, color: e.color, orden: e.orden,
      actuales: e.iniciativas, entradas: entradas[e.id] ?? 0, dias_promedio: dias[e.id] ?? null,
    }));
  },

  // -------------------------------------------------------------------
  // Zona pública: no exige sesión
  // -------------------------------------------------------------------
  async direccionesPublicas(): Promise<{ id: string; nombre: string; nombre_corto: string }[]> {
    if (!USAR_SIMULADO) return pedirReal('/publico/direcciones');
    await esperar(200);
    return direcciones.map((d) => ({ id: d.id, nombre: d.nombre, nombre_corto: d.nombre_corto }));
  },

  async flujoPublico(): Promise<Estado[]> {
    if (!USAR_SIMULADO) return pedirReal('/publico/flujo');
    await esperar(200);
    return [...estados].filter((e) => e.activo).sort((a, b) => a.orden - b.orden);
  },

  async configuracion(): Promise<{ exigir_aprobacion_manual: boolean }> {
    if (!USAR_SIMULADO) {
      return pedirReal('/admin/configuracion');
    }
    await esperar(80);
    return { ...configuracion };
  },

  async guardarConfiguracion(cambios: { exigir_aprobacion_manual: boolean }): Promise<{ exigir_aprobacion_manual: boolean }> {
    if (!USAR_SIMULADO) {
      return pedirReal('/admin/configuracion', { method: 'PUT', body: JSON.stringify(cambios) });
    }
    await esperar(150);
    configuracion = { ...configuracion, ...cambios };
    return { ...configuracion };
  },

  async registrar(datos: { nombre: string; correo: string; contrasena: string }): Promise<Sesion> {
    if (!USAR_SIMULADO) {
      const res = await pedirReal<{ usuario: Sesion }>('/publico/registrar', { method: 'POST', body: JSON.stringify(datos) });
      return res.usuario;
    }
    await esperar(400);
    const correo = datos.correo.trim().toLowerCase();
    if (!datos.nombre.trim()) throw new ErrorApi(400, 'Escriba su nombre completo');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi(400, 'El correo electrónico no es válido');
    if (datos.contrasena.length < 12) throw new ErrorApi(400, 'La contraseña debe tener al menos 12 caracteres');
    if (!/[0-9]/.test(datos.contrasena)) throw new ErrorApi(400, 'La contraseña debe incluir al menos un número');
    if (usuarios.some((u) => u.correo.toLowerCase() === correo)) {
      throw new ErrorApi(409, 'Ya existe una cuenta con ese correo. Inicie sesión.', 'YA_EXISTE');
    }
    const requiereAprobacion = configuracion.exigir_aprobacion_manual;
    const nuevoId = Math.max(...usuarios.map((u) => u.id)) + 1;
    const nuevoUsuario: Usuario = {
      id: nuevoId,
      nombre: datos.nombre.trim(), correo, direccion_id: null, direccion_nombre: null,
      rol_id: 1, rol_nombre: 'Lector', rol_clave: 'lector',
      activo: true, pendiente_aprobacion: requiereAprobacion,
      ultimo_ingreso: new Date().toISOString().slice(0, 16).replace('T', ' '),
      registrado_en: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    usuarios.push(nuevoUsuario);
    sesion = {
      id: nuevoUsuario.id,
      nombre: nuevoUsuario.nombre,
      correo: nuevoUsuario.correo,
      direccion_id: null,
      rol_nombre: 'Lector',
      permisos: ['iniciativas.ver'],
      pendiente_aprobacion: requiereAprobacion,
      debe_cambiar: false,
    };
    return sesion;
  },

  async crearPropuesta(datos: {
    direccion_id: string; nombre: string; objeto: string;
    numero_proyecto: string; contacto?: string; correo?: string;
    documentos?: { nombre: string; enlace: string }[];
  }): Promise<{ id: number }> {
    if (!USAR_SIMULADO) {
      return pedirReal('/publico/propuestas', { method: 'POST', body: JSON.stringify(datos) });
    }
    await esperar(450);
    if (!datos.direccion_id) throw new ErrorApi(400, 'Seleccione la dirección');
    if (datos.nombre.trim().length < 8) {
      throw new ErrorApi(400, 'Describa la iniciativa con un poco más de detalle');
    }
    const inicial = estados.find((e) => e.es_inicial) ?? estados[0];
    const id = Math.max(...iniciativas.map((i) => i.id)) + 1;
    iniciativas.push(nuevaIniciativa(
      id, datos.direccion_id, datos.nombre.trim(), datos.objeto.trim(),
      datos.numero_proyecto.trim(), inicial.id, 'Media',
      new Date().toISOString().slice(0, 10),
      { origen: 'propuesta', propuesta_nombre: datos.contacto || 'Sin identificar', total_movimientos: 1 },
    ));
    recalcularConteos();
    return { id };
  },

  async usuariosSimples(): Promise<{ id: number; nombre: string }[]> {
    if (!USAR_SIMULADO) {
      const list = await pedirReal<Usuario[]>('/admin/usuarios');
      return list.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }));
    }
    await esperar(140);
    return usuarios.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }));
  },
};
