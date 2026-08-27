// =====================================================================
// Tipos del dominio. Espejo de lo que devuelven los procedimientos
// almacenados: al compartirlos, un estado mal escrito falla al compilar
// en vez de convertirse en un 400 en producción.
// =====================================================================

export type ColorEstado = 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo' | 'morado';
export type Alcance = 'publico' | 'autenticado' | 'direccion' | 'responsables';
export type TipoTransicion = 'avanzar' | 'devolver' | 'rechazar' | 'cerrar';
export type TipoMovimiento = TipoTransicion | 'acotar' | 'creacion' | 'edicion';
export type Prioridad = 'Alta' | 'Media' | 'Baja';

export interface Direccion {
  id: string;
  nombre: string;
  nombre_corto: string;
  descripcion: string;
  total_iniciativas: number;
}

export interface Estado {
  id: number;
  clave: string;
  nombre: string;
  color: ColorEstado;
  orden: number;
  es_inicial: boolean;
  es_final: boolean;
  activo: boolean;
  visibilidad: Alcance;
  iniciativas: number;
  responsables_activos: number;
}

export interface Transicion {
  id: number;
  tipo: TipoTransicion;
  etiqueta: string;
  requiere_motivo: boolean;
  destino_id: number;
  destino_nombre: string;
  destino_color: ColorEstado;
}

export interface Iniciativa {
  id: number;
  direccion_id: string;
  nombre: string;
  objeto: string;
  numero_proyecto: string;
  estado: string;
  estado_id: number;
  estado_clave: string;
  estado_color: ColorEstado;
  visibilidad: Alcance;
  prioridad: Prioridad;
  fecha_actualizacion: string | null;
  fuente_publica: boolean;
  origen: 'interna' | 'propuesta';
  // Opcionales a propósito: la API los retira cuando no hay sesión, para no
  // publicar la identidad de quien radicó una iniciativa ciudadana. El tipo
  // tiene que reflejarlo, o el código los leería como si siempre llegaran.
  propuesta_por?: number | null;
  propuesta_nombre?: string | null;
  total_documentos: number;
  total_movimientos: number;
  // Fecha del último movimiento que CAMBIÓ el estado. NULL mientras la
  // iniciativa no tenga historial de transiciones. Ver db/13.
  desde_estado?: string | null;
}

export interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  motivo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  creado_en: string;
  usuario: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  // Qué columna se editó. Solo llega con tipo 'edicion'.
  campo?: string | null;
}

// Lo único que se puede cambiar editando la tabla.
//
// `estado` NO está aquí a propósito: la API lo rechaza con un 400 porque
// escribirlo por esta vía dejaba la fila contradiciéndose —la columna de
// compatibilidad decía una cosa y `estado_id` otra—. El estado se mueve por
// /:id/mover, que valida la transición y deja constancia.
//
// Con el tipo acotado, mandarlo falla al compilar en vez de en producción.
export type CamposEditables = Pick<
  Iniciativa,
  'nombre' | 'objeto' | 'numero_proyecto' | 'prioridad' | 'fecha_actualizacion'
>;

export interface Permiso {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string;
  grupo: string;
  orden: number;
}

export interface Rol {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string;
  es_sistema: boolean;
  activo: boolean;
  usuarios: number;
  permisos: string[];
}

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  direccion_id: string | null;
  direccion_nombre: string | null;
  rol_id: number;
  rol_nombre: string;
  rol_clave: string;
  activo: boolean;
  pendiente_aprobacion: boolean;
  ultimo_ingreso: string | null;
  registrado_en: string | null;
}

export interface Sesion {
  id: number;
  nombre: string;
  correo: string;
  direccion_id: string | null;
  rol_nombre: string;
  permisos: string[];
  pendiente_aprobacion: boolean;
  // Con contraseña provisional se puede consultar pero no escribir. El
  // campo viajaba desde el ingreso y la interfaz no lo declaraba, así que
  // toda escritura devolvía 403 con el código CAMBIO_REQUERIDO y ninguna
  // pantalla sabía qué hacer con él: un callejón sin salida.
  debe_cambiar: boolean;
}

export interface EstadisticaEstado {
  id: number;
  clave: string;
  nombre: string;
  color: ColorEstado;
  orden: number;
  actuales: number;
  entradas: number;
  dias_promedio: number | null;
}

export interface Responsable {
  usuario_id: number;
  nombre: string;
  puede_avanzar: boolean;
  puede_devolver: boolean;
  puede_rechazar: boolean;
  puede_cerrar: boolean;
  puede_acotar: boolean;
}
