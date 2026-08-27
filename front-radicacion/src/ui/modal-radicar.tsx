import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ErrorApi } from '../api/cliente';
import type { Sesion } from '../api/tipos';
import { Modal, Campo, Texto, Boton, Aviso } from './base';
import {
  CheckCircle2, Copy, Check, Sparkles, Paperclip, Plus, Trash2,
  FileText, Mail, ChevronRight, ChevronLeft, Send, Shield,
} from 'lucide-react';

// Clave del borrador en el navegador. Lleva versión para poder cambiar la
// forma de lo guardado sin tropezar con borradores viejos.
const CLAVE_BORRADOR = 'iniciativas.borrador.radicar.v1';

interface Borrador {
  direccionId?: string;
  nombre?: string;
  objeto?: string;
  numeroProyecto?: string;
  documentos?: { id: string; nombre: string; enlace: string }[];
}

interface ModalRadicarProps {
  direccionInicial?: string;
  sesion: Sesion | null;
  onCerrar: () => void;
  onIniciativaCreada?: (id: number, direccionId: string) => void;
}

// =====================================================================
// Stepper visual — barra de progreso con 3 círculos numerados
// =====================================================================
const PASOS = [
  { num: 1, titulo: 'Información', icono: FileText },
  { num: 2, titulo: 'Documentos',  icono: Paperclip },
  { num: 3, titulo: 'Confirmar',   icono: Shield },
] as const;

function Stepper({ paso }: { paso: number }) {
  const porcentaje = paso === 1 ? 0 : paso === 2 ? 50 : 100;
  return (
    <div className="px-1 pb-2">
      {/* Línea de fondo + avance */}
      <div className="relative flex items-center justify-between">
        <div className="wizard-linea-fondo" />
        <div className="wizard-linea-avance" style={{ width: `${porcentaje}%` }} />

        {PASOS.map((p) => {
          const completo = p.num < paso;
          const activo = p.num === paso;
          const Icono = p.icono;
          return (
            <div key={p.num} className="flex flex-col items-center gap-1.5">
              <div
                className="wizard-circulo"
                data-activo={activo ? 'true' : undefined}
                data-completo={completo ? 'true' : undefined}
              >
                {completo ? <Check size={16} strokeWidth={3} /> : <Icono size={14} />}
              </div>
              <span className={`text-[11px] font-semibold whitespace-nowrap transition-colors ${
                activo ? 'text-accion' : completo ? 'text-verde' : 'text-tenue'
              }`}>
                {p.titulo}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// Componente principal
// =====================================================================
export function ModalRadicarIniciativa({
  direccionInicial = '',
  sesion,
  onCerrar,
  onIniciativaCreada,
}: ModalRadicarProps) {
  // ── Estado del formulario ──
  const [direccionId, setDireccionId] = useState(direccionInicial);
  const [nombre, setNombre] = useState('');
  const [objeto, setObjeto] = useState('');
  const [numeroProyecto, setNumeroProyecto] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');
  const [documentos, setDocumentos] = useState<{ id: string; nombre: string; enlace: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [falloCopia, setFalloCopia] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  // Arranca en false y no se guarda en el borrador: una autorización de
  // tratamiento de datos tiene que darse cada vez, a propósito.
  const [autorizaDatos, setAutorizaDatos] = useState(false);
  const campoCodigo = useRef<HTMLInputElement>(null);
  // Errores por campo, no un único aviso arriba: con el formulario
  // desplazado en un celular, el aviso del principio no se veía.
  const [errores, setErrores] = useState<Record<string, string>>({});

  // ── Wizard ──
  const [paso, setPaso] = useState(1);

  // Estado de éxito con el resultado de radicación
  const [radicadoExitoso, setRadicadoExitoso] = useState<{
    id: number;
    codigo: string;
    nombre: string;
    direccionId: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const { data: direcciones } = useQuery({ queryKey: ['direcciones'], queryFn: api.direcciones });

  // ── Borrador local ──
  useEffect(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      if (!crudo) return;
      const b = JSON.parse(crudo);
      if (b && typeof b === 'object') setBorrador(b);
    } catch {
      // Ventana privada, almacenamiento bloqueado o borrador corrupto.
    }
  }, []);

  useEffect(() => {
    if (radicadoExitoso) return;
    const hayAlgo = nombre.trim() || objeto.trim() || numeroProyecto.trim()
      || documentos.some((d) => d.nombre.trim() || d.enlace.trim());
    try {
      if (hayAlgo) {
        localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
          direccionId, nombre, objeto, numeroProyecto, documentos,
        }));
      } else {
        localStorage.removeItem(CLAVE_BORRADOR);
      }
    } catch { /* almacenamiento no disponible */ }
  }, [direccionId, nombre, objeto, numeroProyecto, documentos, radicadoExitoso]);

  // El error de un campo desaparece en cuanto se escribe en él.
  function alEscribir(campo: string, fijar: (v: string) => void) {
    return (v: string) => {
      fijar(v);
      setErrores((e) => {
        if (!(campo in e)) return e;
        const { [campo]: _, ...resto } = e;
        return resto;
      });
    };
  }

  function recuperarBorrador() {
    if (!borrador) return;
    setDireccionId(borrador.direccionId ?? '');
    setNombre(borrador.nombre ?? '');
    setObjeto(borrador.objeto ?? '');
    setNumeroProyecto(borrador.numeroProyecto ?? '');
    setDocumentos(borrador.documentos ?? []);
    setBorrador(null);
  }

  function descartarBorrador() {
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* nada */ }
    setBorrador(null);
  }

  const direccionSeleccionada = direccionId;

  // ── Validación por paso ──
  function validarPaso(p: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 1) {
      if (!direccionSeleccionada) e.direccion = 'Elija el tema que corresponde a su propuesta.';
      if (nombre.trim().length < 8) {
        e.nombre = 'El título debe tener al menos 8 caracteres, para que se entienda de qué se trata.';
      }
      if (objeto.trim().length < 10) {
        e.objeto = 'Describa el objeto en al menos 10 caracteres.';
      }
    }
    if (p === 3) {
      if (contactoCorreo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactoCorreo.trim())) {
        e.correo = 'Revise el correo: debe tener la forma nombre@dominio.com';
      }
      // Aceptación obligatoria de términos y política de tratamiento de datos
      if (!sesion && !autorizaDatos) {
        e.autorizacion = 'Debe aceptar los términos, condiciones y la autorización de tratamiento de datos personales para radicar su iniciativa.';
      }
    }
    return e;
  }

  function avanzar() {
    const e = validarPaso(paso);
    setErrores(e);
    if (Object.keys(e).length > 0) {
      const primero = Object.keys(e)[0];
      const porId = document.getElementById('campo-' + primero);
      const alternativo = document.querySelector<HTMLElement>(
        '[role="dialog"] [aria-invalid="true"], [role="dialog"] input[type="checkbox"][aria-invalid]',
      );
      (porId ?? alternativo)?.focus();
      (porId ?? alternativo)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (paso < 3) setPaso(paso + 1);
  }

  function retroceder() {
    if (paso > 1) setPaso(paso - 1);
  }

  // ── Mutación de radicación ──
  const mutacionRadicar = useMutation({
    mutationFn: async () => {
      setError(null);
      // Validar paso 1 + paso 3 antes de enviar
      const e1 = validarPaso(1);
      const e3 = validarPaso(3);
      const todosErrores = { ...e1, ...e3 };
      setErrores(todosErrores);
      const primero = Object.keys(todosErrores)[0];
      if (primero) {
        // Ir al paso que tiene el error
        if (Object.keys(e1).length > 0) setPaso(1);
        else setPaso(3);
        const porId = document.getElementById('campo-' + primero);
        const alternativo = document.querySelector<HTMLElement>(
          '[role="dialog"] [aria-invalid="true"], [role="dialog"] input[type="checkbox"][aria-invalid]',
        );
        (porId ?? alternativo)?.focus();
        (porId ?? alternativo)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        throw new Error('Revise los campos marcados antes de continuar.');
      }

      const res = await api.crearPropuesta({
        direccion_id: direccionSeleccionada,
        nombre: nombre.trim(),
        objeto: objeto.trim(),
        numero_proyecto: numeroProyecto.trim(),
        contacto: sesion ? sesion.nombre : contactoNombre.trim() || undefined,
        correo: sesion ? sesion.correo : contactoCorreo.trim() || undefined,
        documentos: documentos
          .filter((d) => d.nombre.trim())
          .map((d) => ({ nombre: d.nombre.trim(), enlace: d.enlace.trim() })),
      });

      const codigo = `INI-2026-${String(res.id).padStart(4, '0')}`;
      return { id: res.id, codigo, nombre: nombre.trim(), direccionId: direccionSeleccionada };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* nada */ }
      setRadicadoExitoso(data);
    },
    onError: (err: ErrorApi | Error) => {
      setError(err.message || 'Error al registrar la iniciativa');
    },
  });

  // ── Copiar código ──
  async function handleCopiarCodigo(codigo: string) {
    setFalloCopia(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codigo);
      } else {
        const campo = document.createElement('textarea');
        campo.value = codigo;
        campo.setAttribute('readonly', '');
        campo.style.position = 'fixed';
        campo.style.opacity = '0';
        document.body.appendChild(campo);
        campo.select();
        const listo = document.execCommand('copy');
        document.body.removeChild(campo);
        if (!listo) throw new Error('sin portapapeles');
      }
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalloCopia(true);
    }
  }

  // =================================================================
  // PANTALLA DE ÉXITO — tras radicación exitosa
  // =================================================================
  if (radicadoExitoso) {
    return (
      <Modal
        key="exito"
        titulo="Iniciativa radicada con éxito"
        descripcion="Guarde el código antes de cerrar: es lo que le permite consultar el avance."
        onCerrar={onCerrar}
        alTocarFuera="ignorar"
        pie={
          <>
            <Boton
              variante="principal"
              onClick={() => {
                onIniciativaCreada?.(radicadoExitoso.id, radicadoExitoso.direccionId);
                onCerrar();
              }}
            >
              Ver iniciativa en el tablero
            </Boton>
          </>
        }
      >
        <div className="space-y-5 text-center">
          {/* Icono de éxito con glow */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-verde-tenue text-verde" style={{ boxShadow: '0 0 0 8px rgba(31, 138, 95, 0.08)' }}>
            <CheckCircle2 size={36} />
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-tenue">
              Identificador Único del Trámite
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <input
                ref={campoCodigo}
                readOnly
                value={radicadoExitoso.codigo}
                aria-label={`Su código único de trámite es ${radicadoExitoso.codigo.split('').join(' ')}. Guárdelo para consultar el avance.`}
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.currentTarget.select()}
                size={radicadoExitoso.codigo.length}
                className="rounded-xl border-2 border-dashed border-accion/30 bg-accion-tenue px-5 py-2.5 text-center font-mono text-[22px] font-bold tracking-wide text-accion focus:outline-none focus:ring-[3px] focus:ring-accion/20"
              />
              <button
                type="button"
                onClick={() => handleCopiarCodigo(radicadoExitoso.codigo)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-linea bg-panel px-3.5 py-2.5 text-[12px] font-semibold text-tinta shadow-sm transition-all hover:bg-panel-2 hover:shadow-md"
              >
                {copiado ? (
                  <><Check size={14} className="text-verde" /> Copiado</>
                ) : (
                  <><Copy size={14} /> Copiar</>
                )}
              </button>
            </div>

            {falloCopia && (
              <p className="mt-2 text-[12px] leading-snug text-ambar" role="alert">
                No se pudo copiar automáticamente. Toque el código para
                seleccionarlo y cópielo, o tome una foto de la pantalla.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-linea bg-panel-2 p-4 text-left text-[13px] leading-relaxed text-slate-700">
            <p className="font-semibold text-tinta">
              {radicadoExitoso.nombre}
            </p>
            <p className="mt-1.5 text-[12px] text-tenue">
              {!sesion ? (
                <>
                  <b className="text-tinta">Importante:</b> Guarde o copie su código (<code className="rounded bg-accion-tenue px-1 py-0.5 text-accion">{radicadoExitoso.codigo}</code>). Con este identificador podrá ingresar en cualquier momento al tablero público, buscar su iniciativa y consultar su avance, estado actual y documentos asociados <b>sin necesidad de iniciar sesión</b>.
                </>
              ) : (
                <>
                  Esta iniciativa quedó registrada y vinculada a su cuenta de <b>{sesion.nombre}</b>. Podrá hacerle seguimiento permanente desde el tablero institucional.
                </>
              )}
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  // =================================================================
  // FORMULARIO — wizard de 3 pasos
  // =================================================================
  const cargando = mutacionRadicar.isPending;

  return (
    <Modal
      key="formulario"
      titulo={sesion ? 'Radicar nueva iniciativa' : 'Registrar iniciativa ciudadana'}
      descripcion={
        sesion
          ? `Radicando como ${sesion.nombre} (${sesion.rol_nombre}).`
          : 'Cualquier persona puede registrar iniciativas para estudio y trámite legislativo.'
      }
      onCerrar={onCerrar}
      alTocarFuera="confirmar"
      pie={
        <div className="flex w-full items-center justify-between gap-2">
          {/* Lado izquierdo: Anterior o Cancelar */}
          <div>
            {paso === 1 ? (
              <Boton variante="secundario" onClick={onCerrar} disabled={cargando}>
                Cancelar
              </Boton>
            ) : (
              <button
                type="button"
                onClick={retroceder}
                disabled={cargando}
                className="inline-flex items-center gap-1 rounded-md px-3 py-2.5 text-[13px] font-semibold text-tenue transition-colors hover:bg-panel-2 hover:text-tinta disabled:opacity-50"
              >
                <ChevronLeft size={16} /> Anterior
              </button>
            )}
          </div>

          {/* Indicador de paso compacto (solo móvil) */}
          <span className="text-[11px] font-semibold text-tenue sm:hidden">
            {paso} de 3
          </span>

          {/* Lado derecho: Siguiente o Radicar */}
          <div>
            {paso < 3 ? (
              <Boton variante="principal" onClick={avanzar} disabled={cargando}>
                Siguiente <ChevronRight size={16} />
              </Boton>
            ) : (
              <Boton
                variante="principal"
                disabled={cargando}
                onClick={() => mutacionRadicar.mutate()}
              >
                {cargando ? 'Radicando…' : <><Send size={14} /> Radicar iniciativa</>}
              </Boton>
            )}
          </div>
        </div>
      }
    >
      {/* Stepper visual */}
      <Stepper paso={paso} />

      {/* Errores globales */}
      {error && (
        <Aviso tipo="error">
          <b>Error:</b> {error}
        </Aviso>
      )}

      {/* Borrador pendiente */}
      {borrador && (
        <div className="rounded-xl border border-l-4 border-ambar bg-ambar-tenue px-4 py-3">
          <p className="text-[13px] font-bold text-tinta">
            Tiene una propuesta a medio diligenciar
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-tinta-2">
            {borrador.nombre
              ? <>Quedó guardada en este dispositivo: «{borrador.nombre}».</>
              : <>Quedó guardada en este dispositivo.</>}
            {' '}¿Quiere continuarla?
          </p>
          <div className="mt-2.5 flex flex-col-reverse gap-2 sm:flex-row">
            <Boton variante="secundario" tamano="chico" onClick={descartarBorrador}>
              Empezar de nuevo
            </Boton>
            <Boton variante="principal" tamano="chico" onClick={recuperarBorrador}>
              Continuar donde iba
            </Boton>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          PASO 1: Información de la iniciativa
          ───────────────────────────────────────────────────── */}
      {paso === 1 && (
        <div key="paso-1" className="wizard-paso space-y-4">
          {/* Banner informativo para ciudadanos */}
          {!sesion && (
            <div className="rounded-xl border border-accion-borde bg-gradient-to-br from-accion-tenue to-white p-4">
              <p className="flex items-center gap-2 text-[13px] font-bold text-[#004884]">
                <Sparkles size={16} className="text-accion" />
                Radicación sin inicio de sesión
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-tenue">
                No requiere cuenta. Al radicar, recibirá un <strong className="text-tinta">Código Único de Trámite</strong> para consultar su iniciativa en cualquier momento.
              </p>
            </div>
          )}

          {/* Dirección / Tema */}
          <Campo
            etiqueta="¿De qué trata su propuesta?"
            pista="Elija el tema más cercano. Si se equivoca no pasa nada: el Ministerio la reasigna."
            error={errores.direccion}
          >
            <select
              id="campo-direccion"
              value={direccionSeleccionada}
              onChange={(e) => {
                setDireccionId(e.target.value);
                setErrores((x) => {
                  const { direccion: _, ...resto } = x;
                  return resto;
                });
              }}
              aria-invalid={!!errores.direccion || undefined}
              className={`w-full rounded-lg border bg-panel px-3 py-2.5 text-[16px] text-tinta focus:outline-none focus:ring-[3px] sm:text-[14px] ${
                errores.direccion
                  ? 'border-rojo focus:border-rojo focus:ring-rojo/12'
                  : 'border-linea focus:border-accion focus:ring-accion/12'
              }`}
            >
              <option value="">Elija el tema de su propuesta…</option>
              {(direcciones ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre_corto}</option>
              ))}
            </select>

            {(() => {
              const d = (direcciones ?? []).find((x) => x.id === direccionSeleccionada);
              if (!d) return null;
              return (
                <p className="mt-2 rounded-lg border border-accion-borde bg-accion-tenue/60 px-3 py-2 text-[12px] leading-relaxed text-tinta-2">
                  <b className="text-tinta">{d.nombre}.</b> {d.descripcion}
                </p>
              );
            })()}
          </Campo>

          {/* Título */}
          <Campo etiqueta="Título o nombre de la iniciativa" pista="Denominación clara del proyecto o propuesta" error={errores.nombre}>
            <Texto
              id="campo-nombre"
              valor={nombre}
              onChange={alEscribir('nombre', setNombre)}
              invalido={!!errores.nombre}
              placeholder="Ej. Proyecto de Ley de Garantías para Personas Defensoras"
            />
          </Campo>

          {/* Objeto */}
          <Campo etiqueta="Objeto y alcance" pista="Explique el propósito y la justificación de la iniciativa" error={errores.objeto}>
            <textarea
              id="campo-objeto"
              value={objeto}
              onChange={(e) => alEscribir('objeto', setObjeto)(e.target.value)}
              rows={3}
              aria-invalid={!!errores.objeto || undefined}
              placeholder="Describa el objetivo principal, las comunidades beneficiadas o el marco normativo propuesto..."
              className={`w-full rounded-lg border bg-panel px-3 py-2 text-[16px] text-tinta placeholder:text-tenue/70 focus:outline-none focus:ring-[3px] sm:text-[14px] ${
                errores.objeto
                  ? 'border-rojo focus:border-rojo focus:ring-rojo/12'
                  : 'border-linea focus:border-accion focus:ring-accion/12'
              }`}
            />
          </Campo>

          {/* Número de proyecto */}
          <Campo etiqueta="Número de proyecto (opcional)" pista="Si ya cuenta con radicado oficial o de Congreso">
            <Texto
              valor={numeroProyecto}
              onChange={setNumeroProyecto}
              placeholder="Ej. PL 142/2026C o Sin radicar"
            />
          </Campo>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          PASO 2: Documentación de soporte
          ───────────────────────────────────────────────────── */}
      {paso === 2 && (
        <div key="paso-2" className="wizard-paso space-y-4">
          <div className="rounded-xl border border-linea bg-gradient-to-br from-panel to-panel-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-[13px] font-bold text-tinta">
                  <Paperclip size={15} className="text-accion" />
                  Documentos de soporte
                  <span className="text-tenue font-normal">(Opcional)</span>
                </p>
                <p className="mt-0.5 text-[12px] text-tenue">
                  Adjunte enlaces a minutas, borradores de articulado o carpetas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocumentos((prev) => [...prev, { id: Math.random().toString(36), nombre: '', enlace: '' }])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accion-borde bg-accion-tenue px-3 py-2 text-[12px] font-semibold text-accion transition-all hover:bg-accion hover:text-white hover:shadow-md"
              >
                <Plus size={14} /> Adjuntar
              </button>
            </div>
          </div>

          {documentos.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-linea bg-panel-2/60 px-6 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accion-tenue text-accion">
                <FileText size={22} />
              </div>
              <p className="text-[13px] font-semibold text-tinta">Sin documentos adjuntos</p>
              <p className="mt-1 max-w-xs text-[12px] text-tenue">
                Este paso es opcional. Si tiene minutas, borradores o referencias normativas, puede adjuntar sus enlaces aquí.
              </p>
              <button
                type="button"
                onClick={() => setDocumentos((prev) => [...prev, { id: Math.random().toString(36), nombre: '', enlace: '' }])}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accion-borde bg-accion-tenue px-4 py-2 text-[12px] font-semibold text-accion transition-all hover:bg-accion hover:text-white"
              >
                <Plus size={14} /> Adjuntar primer enlace
              </button>
            </div>
          )}

          {documentos.map((doc, index) => (
            <div key={doc.id} className="wizard-doc-card rounded-xl border border-linea bg-panel p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tenue">
                  <FileText size={12} className="text-accion" />
                  Documento {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setDocumentos((prev) => prev.filter((d) => d.id !== doc.id))}
                  className="text-tenue hover:text-rojo p-1.5 rounded-lg hover:bg-rojo-tenue transition-colors"
                  title="Quitar este documento"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <input
                  type="text"
                  value={doc.nombre}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDocumentos((prev) => prev.map((d) => d.id === doc.id ? { ...d, nombre: v } : d));
                  }}
                  placeholder="Nombre (ej. Exposición de motivos)"
                  className="w-full rounded-lg border border-linea bg-panel px-3 py-2 text-[13px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                />
                <input
                  type="url"
                  value={doc.enlace}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDocumentos((prev) => prev.map((d) => d.id === doc.id ? { ...d, enlace: v } : d));
                  }}
                  placeholder="Enlace URL (https://drive.google.com/...)"
                  className="w-full rounded-lg border border-linea bg-panel px-3 py-2 text-[13px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                />
              </div>
            </div>
          ))}

          {documentos.length > 0 && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setDocumentos((prev) => [...prev, { id: Math.random().toString(36), nombre: '', enlace: '' }])}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-accion transition-colors hover:bg-accion-tenue"
              >
                <Plus size={14} /> Adjuntar otro enlace
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────
          PASO 3: Contacto y confirmación
          ───────────────────────────────────────────────────── */}
      {paso === 3 && (
        <div key="paso-3" className="wizard-paso space-y-4">
          {!sesion && (
            <>
              {/* Notificaciones del workflow */}
              <div className="rounded-xl border border-accion-borde bg-gradient-to-br from-accion-tenue/80 to-white p-4">
                <p className="flex items-center gap-2 text-[13px] font-bold text-[#004884]">
                  <Mail size={15} className="text-accion" />
                  Datos de contacto y notificaciones
                  <span className="text-tenue font-normal text-[12px]">(Opcionales)</span>
                </p>
                <div className="mt-2.5 space-y-1.5 text-[12px] leading-relaxed text-slate-600">
                  <p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-verde-tenue px-2 py-0.5 text-[10px] font-bold text-verde mr-1">CON CORREO</span>
                    Recibirá notificaciones automáticas cada vez que su iniciativa avance en el flujo de gestión.
                  </p>
                  <p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gris-tenue px-2 py-0.5 text-[10px] font-bold text-gris mr-1">SIN CORREO</span>
                    Podrá consultar el avance en cualquier momento con su código de radicado.
                  </p>
                </div>
              </div>

              {/* Campos de contacto */}
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Campo etiqueta="Nombre / Organización">
                  <Texto
                    valor={contactoNombre}
                    onChange={setContactoNombre}
                    placeholder="Ej. Mesa Nacional de DD.HH."
                  />
                </Campo>
                <Campo etiqueta="Correo para notificaciones (opcional)" error={errores.correo}>
                  <input
                    id="campo-correo"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={contactoCorreo}
                    onChange={(e) => alEscribir('correo', setContactoCorreo)(e.target.value)}
                    aria-invalid={!!errores.correo || undefined}
                    placeholder="notificaciones@organizacion.org"
                    className={`w-full rounded-lg border bg-panel px-3 py-2.5 text-[16px] text-tinta placeholder:text-tenue/70 focus:outline-none focus:ring-[3px] sm:text-[13.5px] ${
                      errores.correo
                        ? 'border-rojo focus:border-rojo focus:ring-rojo/12'
                        : 'border-linea focus:border-accion focus:ring-accion/12'
                    }`}
                  />
                </Campo>
              </div>

              {/* Términos, condiciones y Habeas Data */}
              <div className={`rounded-xl border-2 p-4 transition-all ${
                errores.autorizacion
                  ? 'border-rojo bg-rojo-tenue/30 shadow-sm shadow-rojo/10'
                  : autorizaDatos
                    ? 'border-verde bg-verde-tenue/40'
                    : 'border-linea bg-panel-2'
              }`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    id="campo-autorizacion"
                    type="checkbox"
                    checked={autorizaDatos}
                    onChange={(e) => {
                      setAutorizaDatos(e.target.checked);
                      setErrores((x) => {
                        const { autorizacion: _, ...resto } = x;
                        return resto;
                      });
                    }}
                    aria-invalid={!!errores.autorizacion || undefined}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-2 border-linea-fuerte text-accion focus:ring-accion cursor-pointer"
                  />
                  <span className="text-[12.5px] leading-relaxed text-slate-700">
                    Acepto los <strong className="text-tinta">términos y condiciones</strong> del sistema de seguimiento legislativo y autorizo el <strong className="text-tinta">tratamiento y manejo de mis datos personales</strong> de conformidad con la política del Ministerio del Interior y la Ley Estatutaria 1581 de 2012 (Habeas Data).
                    {errores.autorizacion && (
                      <span className="mt-1.5 block font-semibold text-rojo">
                        {errores.autorizacion}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Resumen previo al envío */}
          <div className="rounded-xl border border-linea bg-panel-2 p-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tenue">
              Resumen antes de radicar
            </p>
            <div className="space-y-1.5 text-[12.5px]">
              <p>
                <span className="font-semibold text-tenue">Tema:</span>{' '}
                <span className="text-tinta">{(direcciones ?? []).find((d) => d.id === direccionSeleccionada)?.nombre_corto || '—'}</span>
              </p>
              <p>
                <span className="font-semibold text-tenue">Título:</span>{' '}
                <span className="text-tinta">{nombre.trim() || '—'}</span>
              </p>
              <p>
                <span className="font-semibold text-tenue">Documentos:</span>{' '}
                <span className="text-tinta">{documentos.filter((d) => d.nombre.trim()).length || 'Ninguno'}</span>
              </p>
              {contactoCorreo.trim() && (
                <p>
                  <span className="font-semibold text-tenue">Notificaciones a:</span>{' '}
                  <span className="text-tinta">{contactoCorreo.trim()}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
