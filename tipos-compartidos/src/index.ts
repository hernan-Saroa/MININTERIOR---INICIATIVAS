// =====================================================================
// Tipos compartidos del dominio — Sistema de Iniciativas Legislativas
// Ministerio del Interior · Viceministerio para el Diálogo Social
//
// Este paquete es el CONTRATO entre los frontends y los microservicios.
// Cualquier cambio aquí debe coordinarse entre los dos equipos.
// =====================================================================

// --- Enums y tipos literales ---

export type ColorEstado = 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo' | 'morado';
export type Alcance = 'publico' | 'autenticado' | 'direccion' | 'responsables';
export type TipoTransicion = 'avanzar' | 'devolver' | 'rechazar' | 'cerrar';
export type TipoMovimiento = TipoTransicion | 'acotar' | 'creacion' | 'edicion';
export type Prioridad = 'Alta' | 'Media' | 'Baja';

// --- ms-iniciativas ---

export interface Direccion {
  id: string;
  nombre: string;
  nombre_corto: string;
  descripcion: string;
  total_iniciativas: number;
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
  propuesta_por?: number | null;
  propuesta_nombre?: string | null;
  total_documentos: number;
  total_movimientos: number;
  desde_estado?: string | null;
}

export type CamposEditables = Pick<
  Iniciativa,
  'nombre' | 'objeto' | 'numero_proyecto' | 'prioridad' | 'fecha_actualizacion'
>;

// --- ms-flujo-estados ---

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
  campo?: string | null;
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

// --- ms-autenticacion ---

export interface Sesion {
  id: number;
  nombre: string;
  correo: string;
  direccion_id: string | null;
  rol_nombre: string;
  permisos: string[];
  pendiente_aprobacion: boolean;
  debe_cambiar: boolean;
}

// --- ms-administracion ---

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
