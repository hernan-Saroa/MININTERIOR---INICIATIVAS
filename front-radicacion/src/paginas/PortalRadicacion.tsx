import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ErrorApi } from '../api/cliente';
import { Campo, Texto, Boton, Aviso } from '../ui/base';
import {
  FileText, Search, Paperclip, Shield, Check, Plus, Trash2,
  Copy, CheckCircle2, ChevronRight, ChevronLeft, Send, Sparkles,
  HelpCircle, ExternalLink, RefreshCw
} from 'lucide-react';

const PASOS = [
  { num: 1, titulo: 'Información', icono: FileText },
  { num: 2, titulo: 'Documentos', icono: Paperclip },
  { num: 3, titulo: 'Confirmación', icono: Shield },
] as const;

export function PortalRadicacion() {
  const [pestana, setPestana] = useState<'radicar' | 'consultar'>('radicar');

  // Estado Radicación
  const [paso, setPaso] = useState(1);
  const [direccionId, setDireccionId] = useState('');
  const [nombre, setNombre] = useState('');
  const [objeto, setObjeto] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');
  const [autorizaDatos, setAutorizaDatos] = useState(false);
  const [documentos, setDocumentos] = useState<{ id: string; nombre: string; enlace: string }[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Radicado exitoso
  const [radicado, setRadicado] = useState<{
    id: number;
    codigo: string;
    nombre: string;
    correo?: string;
  } | null>(null);

  // Estado Consulta
  const [codigoConsulta, setCodigoConsulta] = useState('');
  const [nombreConsulta, setNombreConsulta] = useState('');
  const [resultadoConsulta, setResultadoConsulta] = useState<any | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);

  const { data: direcciones = [] } = useQuery({
    queryKey: ['direccionesPublicas'],
    queryFn: api.direccionesPublicas,
  });

  const { data: estadosFlujo = [] } = useQuery({
    queryKey: ['flujoPublico'],
    queryFn: api.flujoPublico,
  });

  // Mutación de radicación
  const mutacionRadicar = useMutation({
    mutationFn: async () => {
      return api.crearIniciativaPublica({
        direccion_id: direccionId,
        nombre: nombre.trim(),
        objeto: objeto.trim() || undefined,
        propuesta_nombre: contactoNombre.trim(),
        propuesta_correo: contactoCorreo.trim() || undefined,
        documentos: documentos
          .filter((d) => d.nombre.trim() && d.enlace.trim())
          .map((d) => ({ nombre: d.nombre.trim(), enlace: d.enlace.trim() })),
      });
    },
    onSuccess: (res) => {
      setRadicado({
        id: res.id,
        codigo: res.codigo,
        nombre: nombre.trim(),
        correo: contactoCorreo.trim() || undefined,
      });
      setErrorGlobal(null);
    },
    onError: (err: any) => {
      setErrorGlobal(err instanceof ErrorApi ? err.message : 'Error al registrar la iniciativa');
    },
  });

  // Mutación de consulta
  const mutacionConsultar = useMutation({
    mutationFn: async () => {
      setErrorConsulta(null);
      return api.iniciativas();
    },
    onSuccess: (todas) => {
      const codigoBuscado = codigoConsulta.trim().toUpperCase();
      const hallada = todas.find((i) =>
        i.numero_proyecto?.toUpperCase() === codigoBuscado ||
        `INI-2026-${String(i.id).padStart(4, '0')}` === codigoBuscado ||
        String(i.id) === codigoBuscado
      );
      if (hallada) {
        setResultadoConsulta(hallada);
      } else {
        setResultadoConsulta(null);
        setErrorConsulta(`No se encontró ningún trámite con el código «${codigoConsulta.trim()}». Verifique los datos.`);
      }
    },
    onError: () => {
      setErrorConsulta('Error al consultar el trámite. Verifique la conexión.');
    },
  });

  function validarPaso1(): boolean {
    const errs: Record<string, string> = {};
    if (!direccionId) errs.direccion = 'Seleccione la dirección correspondiente';
    if (!nombre.trim()) errs.nombre = 'El nombre de la iniciativa es obligatorio';
    if (!contactoNombre.trim()) errs.contactoNombre = 'Indique su nombre o el de la organización';
    if (contactoCorreo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactoCorreo.trim())) {
      errs.contactoCorreo = 'El correo electrónico no tiene un formato válido';
    }
    if (!autorizaDatos) errs.autoriza = 'Debe aceptar los términos de tratamiento de datos personales';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  }

  function avanzarPaso() {
    if (paso === 1) {
      if (!validarPaso1()) return;
      setPaso(2);
    } else if (paso === 2) {
      setPaso(3);
    }
  }

  function copiarCodigo(texto: string) {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  function reiniciarFormulario() {
    setRadicado(null);
    setPaso(1);
    setNombre('');
    setObjeto('');
    setContactoNombre('');
    setContactoCorreo('');
    setAutorizaDatos(false);
    setDocumentos([]);
    setErrores({});
    setErrorGlobal(null);
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans flex flex-col justify-between">
      {/* 1. Barra Institucional GOV.CO */}
      <header className="w-full">
        <div className="bg-gradient-to-r from-[#0939a0] via-[#0b42b6] to-[#1050c8] text-white py-2 px-4 sm:px-8">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between">
            <a href="https://www.gov.co" target="_blank" rel="noreferrer" className="flex items-center gap-2">
              <img src="/logo-govco.png" alt="Portal GOV.CO" className="h-6 object-contain" />
            </a>
            <span className="text-xs font-semibold tracking-wider text-blue-100 uppercase hidden sm:inline">
              República de Colombia
            </span>
          </div>
        </div>

        {/* 2. Header Ministerio */}
        <div className="bg-white border-b border-slate-200 shadow-sm py-4 px-4 sm:px-8">
          <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo-mininterior.png" alt="Ministerio del Interior" className="h-10 sm:h-12 object-contain" />
              <div className="border-l border-slate-300 pl-3">
                <h1 className="text-sm sm:text-base font-bold text-[#0b42b6] leading-tight">
                  Viceministerio para el Diálogo Social y los DD.HH.
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Portal Ciudadano de Iniciativas Legislativas
                </p>
              </div>
            </div>

            {/* Pestañas de Navegación */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setPestana('radicar')}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  pestana === 'radicar'
                    ? 'bg-white text-[#0b42b6] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText size={16} />
                Radicar Iniciativa
              </button>
              <button
                type="button"
                onClick={() => setPestana('consultar')}
                className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                  pestana === 'consultar'
                    ? 'bg-white text-[#0b42b6] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Search size={16} />
                Consultar Estado
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-[1000px] w-full mx-auto px-4 py-8 flex-1">
        {pestana === 'radicar' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
            {!radicado ? (
              <div>
                {/* Título y Stepper */}
                <div className="text-center max-w-xl mx-auto mb-8">
                  <span className="inline-block bg-blue-50 text-[#0b42b6] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 border border-blue-100">
                    Radicación de Propuesta Ciudadana
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    Registre su Iniciativa
                  </h2>
                  <p className="text-sm text-slate-500 mt-2">
                    Complete los 3 pasos para ingresar su propuesta legislativa al sistema de seguimiento oficial.
                  </p>
                </div>

                {/* Stepper */}
                <div className="max-w-md mx-auto mb-10">
                  <div className="relative flex items-center justify-between">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-slate-100 w-full z-0" />
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-[#0b42b6] z-0 transition-all duration-300"
                      style={{ width: paso === 1 ? '0%' : paso === 2 ? '50%' : '100%' }}
                    />
                    {PASOS.map((p) => {
                      const activo = paso === p.num;
                      const completo = paso > p.num;
                      const Icono = p.icono;
                      return (
                        <div key={p.num} className="relative z-10 flex flex-col items-center gap-1.5">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${
                              completo
                                ? 'bg-[#107c41] text-white'
                                : activo
                                ? 'bg-[#0b42b6] text-white ring-4 ring-blue-100'
                                : 'bg-white border-2 border-slate-300 text-slate-400'
                            }`}
                          >
                            {completo ? <Check size={18} strokeWidth={3} /> : <Icono size={18} />}
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              activo ? 'text-[#0b42b6]' : completo ? 'text-[#107c41]' : 'text-slate-400'
                            }`}
                          >
                            {p.titulo}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {errorGlobal && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {errorGlobal}
                  </div>
                )}

                {/* Paso 1: Información */}
                {paso === 1 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Dirección competente <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={direccionId}
                          onChange={(e) => setDireccionId(e.target.value)}
                          className={`w-full p-3 rounded-xl border bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all ${
                            errores.direccion ? 'border-red-400 ring-1 ring-red-300' : 'border-slate-300'
                          }`}
                        >
                          <option value="">Seleccione una dirección temática...</option>
                          {direcciones.map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre} ({d.nombre_corto})
                            </option>
                          ))}
                        </select>
                        {errores.direccion && <p className="text-xs text-red-500 mt-1 font-medium">{errores.direccion}</p>}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Título o nombre de la iniciativa <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          placeholder="Ej: Proyecto de ley de garantías para líderes sociales"
                          className={`w-full p-3 rounded-xl border bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all ${
                            errores.nombre ? 'border-red-400 ring-1 ring-red-300' : 'border-slate-300'
                          }`}
                        />
                        {errores.nombre && <p className="text-xs text-red-500 mt-1 font-medium">{errores.nombre}</p>}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Objeto o justificación
                        </label>
                        <textarea
                          rows={3}
                          value={objeto}
                          onChange={(e) => setObjeto(e.target.value)}
                          placeholder="Describa el objetivo principal, justificación y alcance de la propuesta..."
                          className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Nombre del proponente u organización <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={contactoNombre}
                          onChange={(e) => setContactoNombre(e.target.value)}
                          placeholder="Nombre y apellidos"
                          className={`w-full p-3 rounded-xl border bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all ${
                            errores.contactoNombre ? 'border-red-400 ring-1 ring-red-300' : 'border-slate-300'
                          }`}
                        />
                        {errores.contactoNombre && <p className="text-xs text-red-500 mt-1 font-medium">{errores.contactoNombre}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Correo para notificaciones (opcional)
                        </label>
                        <input
                          type="email"
                          value={contactoCorreo}
                          onChange={(e) => setContactoCorreo(e.target.value)}
                          placeholder="correo@ejemplo.com"
                          className={`w-full p-3 rounded-xl border bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all ${
                            errores.contactoCorreo ? 'border-red-400 ring-1 ring-red-300' : 'border-slate-300'
                          }`}
                        />
                        {errores.contactoCorreo && <p className="text-xs text-red-500 mt-1 font-medium">{errores.contactoCorreo}</p>}
                        <p className="text-xs text-slate-400 mt-1">
                          Si indica un correo, le llegarán alertas del avance del trámite.
                        </p>
                      </div>
                    </div>

                    {/* Habeas Data */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autorizaDatos}
                          onChange={(e) => setAutorizaDatos(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0b42b6] focus:ring-blue-500"
                        />
                        <span className="text-xs text-slate-600 leading-relaxed">
                          Acepto los términos y condiciones de tratamiento de datos personales conforme a la <strong>Ley 1581 de 2012</strong> de la República de Colombia y autorizo al Ministerio del Interior para el trámite de esta iniciativa. <span className="text-red-500">*</span>
                        </span>
                      </label>
                      {errores.autoriza && <p className="text-xs text-red-500 mt-2 font-medium">{errores.autoriza}</p>}
                    </div>

                    <div className="flex justify-end pt-4">
                      <button
                        type="button"
                        onClick={avanzarPaso}
                        className="px-6 py-3 bg-[#0b42b6] hover:bg-[#0939a0] text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                      >
                        Siguiente: Documentos
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Paso 2: Documentos */}
                {paso === 2 && (
                  <div className="space-y-6">
                    <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100 flex items-start gap-3 text-xs text-blue-900">
                      <HelpCircle size={20} className="text-[#0b42b6] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Documentación soporte (opcional)</p>
                        <p className="mt-0.5 text-blue-800">
                          Agregue enlaces a documentos alojados en la nube (Google Drive, OneDrive, etc.). Recuerde configurar el enlace con acceso de lectura.
                        </p>
                      </div>
                    </div>

                    {documentos.length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                        <Paperclip size={32} className="mx-auto text-slate-400 mb-2" />
                        <p className="text-sm font-medium text-slate-600">No ha agregado ningún documento aún</p>
                        <button
                          type="button"
                          onClick={() => setDocumentos([{ id: String(Date.now()), nombre: '', enlace: '' }])}
                          className="mt-3 px-4 py-2 bg-white border border-slate-300 text-xs font-bold text-slate-700 rounded-lg hover:bg-slate-50 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Plus size={16} />
                          Agregar primer documento
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {documentos.map((doc, idx) => (
                          <div key={doc.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            <div className="sm:col-span-5">
                              <input
                                type="text"
                                placeholder="Nombre del documento (ej. Exposición de motivos)"
                                value={doc.nombre}
                                onChange={(e) => {
                                  const n = [...documentos];
                                  n[idx].nombre = e.target.value;
                                  setDocumentos(n);
                                }}
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                            <div className="sm:col-span-6">
                              <input
                                type="url"
                                placeholder="https://drive.google.com/..."
                                value={doc.enlace}
                                onChange={(e) => {
                                  const n = [...documentos];
                                  n[idx].enlace = e.target.value;
                                  setDocumentos(n);
                                }}
                                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => setDocumentos(documentos.filter((_, i) => i !== idx))}
                                className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setDocumentos([...documentos, { id: String(Date.now()), nombre: '', enlace: '' }])}
                          className="px-4 py-2 text-xs font-bold text-[#0b42b6] hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus size={16} />
                          Agregar otro documento
                        </button>
                      </div>
                    )}

                    <div className="flex justify-between pt-4 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPaso(1)}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <ChevronLeft size={18} />
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={avanzarPaso}
                        className="px-6 py-3 bg-[#0b42b6] hover:bg-[#0939a0] text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                      >
                        Siguiente: Confirmar
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Paso 3: Confirmación */}
                {paso === 3 && (
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Iniciativa</span>
                        <h4 className="text-base font-bold text-slate-900 mt-0.5">{nombre}</h4>
                      </div>
                      {objeto && (
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Objeto</span>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{objeto}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Proponente</span>
                          <p className="text-xs font-semibold text-slate-800">{contactoNombre}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Notificaciones</span>
                          <p className="text-xs font-semibold text-slate-800">{contactoCorreo || 'Sin correo registrado'}</p>
                        </div>
                      </div>
                      {documentos.filter((d) => d.nombre.trim()).length > 0 && (
                        <div className="pt-2 border-t border-slate-200">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Documentos adjuntos</span>
                          <ul className="mt-1 space-y-1">
                            {documentos.filter((d) => d.nombre.trim()).map((d) => (
                              <li key={d.id} className="text-xs text-slate-600 flex items-center gap-1.5">
                                <Paperclip size={12} className="text-slate-400" />
                                {d.nombre}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between pt-4 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setPaso(2)}
                        disabled={mutacionRadicar.isPending}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <ChevronLeft size={18} />
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => mutacionRadicar.mutate()}
                        disabled={mutacionRadicar.isPending}
                        className="px-8 py-3 bg-[#107c41] hover:bg-[#0c6233] text-white font-extrabold text-sm rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                      >
                        {mutacionRadicar.isPending ? (
                          <>
                            <RefreshCw size={18} className="animate-spin" />
                            Radicando iniciativa...
                          </>
                        ) : (
                          <>
                            <Send size={18} />
                            Confirmar y Radicar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Pantalla de Éxito */
              <div className="text-center py-6 max-w-lg mx-auto">
                <div className="w-16 h-16 bg-green-100 text-[#107c41] rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={36} strokeWidth={2.5} />
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900">
                  ¡Iniciativa Radicada Exitosamente!
                </h3>
                <p className="text-sm text-slate-600 mt-2">
                  Guarde su código de radicado para realizar el seguimiento en línea.
                </p>

                {/* Tarjeta de Código */}
                <div className="my-6 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#0b42b6]">
                    Código Único de Trámite
                  </span>
                  <div className="text-3xl font-mono font-extrabold text-slate-900 my-2 tracking-wider">
                    {radicado.codigo}
                  </div>
                  <button
                    type="button"
                    onClick={() => copiarCodigo(radicado.codigo)}
                    className="px-4 py-2 bg-white border border-blue-200 text-xs font-bold text-[#0b42b6] rounded-lg hover:bg-blue-50 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {copiado ? (
                      <>
                        <Check size={14} className="text-[#107c41]" />
                        ¡Copiado al portapapeles!
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copiar código
                      </>
                    )}
                  </button>
                </div>

                {radicado.correo && (
                  <p className="text-xs text-slate-500 mb-6">
                    Se han enviado las instrucciones y la confirmación al correo <strong>{radicado.correo}</strong>.
                  </p>
                )}

                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCodigoConsulta(radicado.codigo);
                      setPestana('consultar');
                      mutacionConsultar.mutate();
                    }}
                    className="px-5 py-2.5 bg-[#0b42b6] hover:bg-[#0939a0] text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                  >
                    Consultar estado del trámite
                  </button>
                  <button
                    type="button"
                    onClick={reiniciarFormulario}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Radicar otra iniciativa
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {pestana === 'consultar' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <span className="inline-block bg-blue-50 text-[#0b42b6] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 border border-blue-100">
                Consulta Pública de Trámites
              </span>
              <h2 className="text-2xl font-extrabold text-slate-900">
                Consulte el Estado de su Iniciativa
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Ingrese el código asignado al radicar (ejemplo: <code>INI-2026-0001</code> o número de proyecto).
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (codigoConsulta.trim()) mutacionConsultar.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Código de trámite
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codigoConsulta}
                    onChange={(e) => setCodigoConsulta(e.target.value)}
                    placeholder="INI-2026-XXXX o PL 214/2026C"
                    className="flex-1 p-3 rounded-xl border border-slate-300 bg-slate-50 text-sm uppercase font-mono font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={mutacionConsultar.isPending || !codigoConsulta.trim()}
                    className="px-6 py-3 bg-[#0b42b6] hover:bg-[#0939a0] text-white font-bold text-sm rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Search size={18} />
                    Buscar
                  </button>
                </div>
              </div>
            </form>

            {errorConsulta && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {errorConsulta}
              </div>
            )}

            {/* Resultado de la consulta */}
            {resultadoConsulta && (
              <div className="mt-8 pt-6 border-t border-slate-200 space-y-6">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-mono font-extrabold text-[#0b42b6] bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                      {resultadoConsulta.numero_proyecto || `INI-2026-${String(resultadoConsulta.id).padStart(4, '0')}`}
                    </span>
                    <span
                      className="px-3 py-1 rounded-full text-xs font-extrabold"
                      style={{
                        backgroundColor:
                          resultadoConsulta.estado_color === 'verde'
                            ? '#e6f4ea'
                            : resultadoConsulta.estado_color === 'azul'
                            ? '#e8f0fe'
                            : resultadoConsulta.estado_color === 'ambar'
                            ? '#fef7e0'
                            : resultadoConsulta.estado_color === 'morado'
                            ? '#f3e8fd'
                            : resultadoConsulta.estado_color === 'rojo'
                            ? '#fce8e6'
                            : '#f1f3f4',
                        color:
                          resultadoConsulta.estado_color === 'verde'
                            ? '#137333'
                            : resultadoConsulta.estado_color === 'azul'
                            ? '#1a73e8'
                            : resultadoConsulta.estado_color === 'ambar'
                            ? '#b06000'
                            : resultadoConsulta.estado_color === 'morado'
                            ? '#8430ce'
                            : resultadoConsulta.estado_color === 'rojo'
                            ? '#c5221f'
                            : '#5f6368',
                      }}
                    >
                      {resultadoConsulta.estado}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {resultadoConsulta.nombre}
                  </h3>
                  {resultadoConsulta.objeto && (
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {resultadoConsulta.objeto}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <div>
                      <span className="block font-bold text-slate-700">Última actualización</span>
                      {resultadoConsulta.fecha_actualizacion || 'Reciente'}
                    </div>
                    <div>
                      <span className="block font-bold text-slate-700">Prioridad</span>
                      {resultadoConsulta.prioridad}
                    </div>
                  </div>
                </div>

                {/* Línea de tiempo visual del flujo */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                    Flujo de Tramitación
                  </h4>
                  <div className="space-y-3">
                    {estadosFlujo.map((e: any, idx: number) => {
                      const esActual = e.id === resultadoConsulta.estado_id;
                      const esPasado = e.orden < resultadoConsulta.estado_id;
                      return (
                        <div key={e.id} className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                              esActual
                                ? 'bg-[#0b42b6] text-white ring-4 ring-blue-100'
                                : esPasado
                                ? 'bg-[#107c41] text-white'
                                : 'bg-slate-100 text-slate-400 border border-slate-300'
                            }`}
                          >
                            {esPasado ? <Check size={14} strokeWidth={3} /> : idx + 1}
                          </div>
                          <div className="flex-1 flex items-center justify-between">
                            <span className={`text-xs font-semibold ${esActual ? 'text-[#0b42b6] font-bold' : 'text-slate-600'}`}>
                              {e.nombre}
                            </span>
                            {esActual && (
                              <span className="text-[10px] bg-blue-100 text-[#0b42b6] font-bold px-2 py-0.5 rounded-full">
                                Estado Actual
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Institucional */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4 sm:px-8 text-center text-xs text-slate-500">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Ministerio del Interior · República de Colombia</p>
          <p>Viceministerio para el Diálogo Social y los Derechos Humanos</p>
        </div>
      </footer>
    </div>
  );
}
