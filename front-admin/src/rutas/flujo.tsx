import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertTriangle } from 'lucide-react';
import { api, ErrorApi } from '../api/cliente';
import type { Estado, ColorEstado, Alcance } from '../api/tipos';
import {
  Boton, Tarjeta, Epigrafe, Campo, Texto, Selector, Modal, Cargando,
  Aviso, Insignia, Visibilidad, Interruptor, ErrorPantalla
} from '../ui/base';
import { Riel } from '../ui/riel';

const COLORES: { valor: ColorEstado; texto: string }[] = [
  { valor: 'gris', texto: 'Gris — sin actividad' },
  { valor: 'azul', texto: 'Azul — en curso' },
  { valor: 'morado', texto: 'Morado — en revisión' },
  { valor: 'ambar', texto: 'Ámbar — requiere atención' },
  { valor: 'verde', texto: 'Verde — resuelto' },
  { valor: 'rojo', texto: 'Rojo — cerrado o rechazado' },
];

const ALCANCES: { valor: Alcance; texto: string }[] = [
  { valor: 'responsables', texto: 'Solo los responsables del estado' },
  { valor: 'direccion', texto: 'La dirección dueña de la iniciativa' },
  { valor: 'autenticado', texto: 'Cualquier persona con cuenta' },
  { valor: 'publico', texto: 'Cualquiera, sin necesidad de cuenta' },
];

export function Flujo() {
  const [editando, setEditando] = useState<Estado | 'nuevo' | null>(null);
  const [responsablesDe, setResponsablesDe] = useState<Estado | null>(null);
  const { data: estados, isLoading, isError, error, refetch } = useQuery({ queryKey: ['estados'], queryFn: api.estados });

  const sinResponsable = (estados ?? []).filter((e) => e.activo && !e.es_final && e.responsables_activos === 0);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Epigrafe>Configuración</Epigrafe>
          <h1 className="titulo mt-1.5 text-[26px] leading-tight sm:text-[30px]">Flujo de estados</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-tenue">
            Los estados por los que pasa una iniciativa, quién puede moverla en cada
            uno y quién alcanza a verla mientras está ahí.
          </p>
        </div>
        <Boton onClick={() => setEditando('nuevo')}><Plus size={15} /> Añadir estado</Boton>
      </header>

      {sinResponsable.length > 0 && (
        <div className="mb-5">
          <Aviso tipo="error">
            <span className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                <b className="text-tinta">
                  {sinResponsable.map((e) => e.nombre).join(', ')}
                </b>{' '}
                {sinResponsable.length === 1 ? 'no tiene' : 'no tienen'} responsables activos.
                Las iniciativas que lleguen ahí se quedan quietas y nadie recibe aviso.
              </span>
            </span>
          </Aviso>
        </div>
      )}

      {isLoading ? <Cargando texto="Cargando el flujo" /> : (
        <>
          <Tarjeta className="mb-5 overflow-hidden p-4 sm:p-5">
            <Epigrafe>El flujo configurado</Epigrafe>
            <div className="mt-3">
              {estados && (
                <Riel
                  estados={estados.filter((e) => e.activo)}
                  conteos={Object.fromEntries(estados.map((e) => [e.id, e.iniciativas]))}
                  onElegir={(id) => setEditando(estados.find((e) => e.id === id)!)}
                />
              )}
            </div>
            <p className="mt-3 text-[12px] text-tenue">Pulse un estado para editarlo.</p>
          </Tarjeta>

          <ul className="space-y-2.5">
            {(estados ?? []).map((e) => (
              <li key={e.id}>
                <Tarjeta className={`p-4 ${!e.es_final && e.responsables_activos === 0 ? 'border-l-[3px] border-l-rojo' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="cifras text-[12px] font-bold text-tenue">{e.orden}</span>
                        <Insignia color={e.color}>{e.nombre}</Insignia>
                        {e.es_inicial && <span className="text-[11px] text-tenue">estado inicial</span>}
                        {e.es_final && <span className="text-[11px] text-tenue">estado final</span>}
                      </p>
                      <p className="clave mt-1.5 block">{e.clave}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-tenue">
                        <span className="cifras">{e.iniciativas} {e.iniciativas === 1 ? 'iniciativa' : 'iniciativas'}</span>
                        <span className={`cifras ${e.responsables_activos === 0 && !e.es_final ? 'font-bold text-rojo' : ''}`}>
                          {e.responsables_activos} {e.responsables_activos === 1 ? 'responsable' : 'responsables'}
                        </span>
                        <span className="flex items-center gap-1.5">Ve: <Visibilidad alcance={e.visibilidad} /></span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Boton tamano="chico" variante="secundario" onClick={() => setResponsablesDe(e)}>
                        Responsables
                      </Boton>
                      <Boton tamano="chico" variante="secundario" onClick={() => setEditando(e)}>
                        Editar
                      </Boton>
                    </div>
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </>
      )}

      {editando && (
        <ModalEstado estado={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} />
      )}
      {responsablesDe && (
        <ModalResponsables estado={responsablesDe} onCerrar={() => setResponsablesDe(null)} />
      )}
    </div>
  );
}

function ModalEstado({ estado, onCerrar }: { estado: Estado | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(estado?.nombre ?? '');
  const [color, setColor] = useState<ColorEstado>(estado?.color ?? 'azul');
  const [orden, setOrden] = useState(String(estado?.orden ?? ''));
  const [visibilidad, setVisibilidad] = useState<Alcance>(estado?.visibilidad ?? 'autenticado');
  const [esFinal, setEsFinal] = useState(estado?.es_final ?? false);
  const [error, setError] = useState('');
  const clienteConsultas = useQueryClient();

  const guardar = useMutation({
    mutationFn: () => api.guardarEstado({
      id: estado?.id, nombre, color, orden: Number(orden) || 99, visibilidad, es_final: esFinal,
    }),
    onSuccess: () => { clienteConsultas.invalidateQueries(); onCerrar(); },
    onError: (e: ErrorApi) => setError(e.message),
  });

  return (
    <Modal
      titulo={estado ? 'Editar estado' : 'Añadir un estado'}
      descripcion="El nombre es lo que verán en el tablero. La visibilidad decide quién alcanza a ver una iniciativa mientras está en este estado."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={guardar.isPending || !nombre.trim()} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando' : 'Guardar estado'}
          </Boton>
        </>
      }
    >
      {error && <Aviso tipo="error">{error}</Aviso>}

      <Campo etiqueta="Nombre">
        <Texto valor={nombre} onChange={setNombre} placeholder="Por ejemplo: En concepto jurídico" />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Color" pista="Sirve para ubicarlo de un vistazo.">
          <Selector valor={color} onChange={(v) => setColor(v as ColorEstado)} opciones={COLORES} />
        </Campo>
        <Campo etiqueta="Posición en el flujo">
          <Texto valor={orden} onChange={setOrden} placeholder="3" />
        </Campo>
      </div>

      <Campo etiqueta="Quién ve las iniciativas en este estado">
        <Selector valor={visibilidad} onChange={(v) => setVisibilidad(v as Alcance)} opciones={ALCANCES} />
      </Campo>

      {visibilidad === 'publico' && (
        <Aviso tipo="atencion">
          Con esta opción, cualquier persona podrá leer las iniciativas que estén en
          este estado sin iniciar sesión. Revíselo antes de guardar.
        </Aviso>
      )}

      <div className="border-t border-linea pt-4">
        <Interruptor activo={esFinal} onChange={setEsFinal}
          etiqueta="Es un estado final — el trámite termina aquí" />
      </div>
    </Modal>
  );
}

function ModalResponsables({ estado, onCerrar }: { estado: Estado; onCerrar: () => void }) {
  const [error, setError] = useState('');
  const clienteConsultas = useQueryClient();
  const { data: responsables } = useQuery({
    queryKey: ['responsables', estado.id],
    queryFn: () => api.responsables(estado.id),
  });
  const { data: usuarios } = useQuery({ queryKey: ['usuarios-simples'], queryFn: api.usuariosSimples });

  const guardar = useMutation({
    mutationFn: (r: any) => api.guardarResponsable(estado.id, r),
    onSuccess: () => clienteConsultas.invalidateQueries(),
    onError: (e: ErrorApi) => setError(e.message),
  });

  const quitar = useMutation({
    mutationFn: (id: number) => api.quitarResponsable(estado.id, id),
    onSuccess: () => { setError(''); clienteConsultas.invalidateQueries(); },
    onError: (e: ErrorApi) => setError(e.message),
  });

  const disponibles = (usuarios ?? []).filter(
    (u) => !(responsables ?? []).some((r) => r.usuario_id === u.id),
  );

  const ACCIONES = [
    { campo: 'puede_avanzar', texto: 'Avanzar' },
    { campo: 'puede_devolver', texto: 'Devolver' },
    { campo: 'puede_rechazar', texto: 'Rechazar' },
    { campo: 'puede_cerrar', texto: 'Cerrar' },
    { campo: 'puede_acotar', texto: 'Acotar' },
  ] as const;

  return (
    <Modal
      titulo={`Responsables de ${estado.nombre}`}
      descripcion="Los permisos se asignan por persona. Marque qué puede hacer cada una con las iniciativas que estén en este estado."
      onCerrar={onCerrar}
      pie={<Boton variante="secundario" onClick={onCerrar}>Cerrar</Boton>}
    >
      {error && <Aviso tipo="error">{error}</Aviso>}

      {(responsables ?? []).length === 0 ? (
        <Aviso tipo="error">
          Este estado no tiene responsables. Las iniciativas que lleguen aquí no
          podrán avanzar hasta que asigne al menos una persona.
        </Aviso>
      ) : (
        <ul className="space-y-2.5">
          {(responsables ?? []).map((r) => (
            <li key={r.usuario_id} className="rounded-md ring-1 ring-linea">
              <div className="flex items-center justify-between gap-2 border-b border-linea px-3 py-2">
                <span className="text-[13.5px] font-bold">{r.nombre}</span>
                <Boton tamano="chico" variante="fantasma"
                  onClick={() => quitar.mutate(r.usuario_id)}>Quitar</Boton>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 px-3 py-2.5">
                {ACCIONES.map((a) => (
                  <label key={a.campo} className="flex cursor-pointer items-center gap-1.5 text-[12.5px]">
                    <input type="checkbox" checked={r[a.campo]}
                      onChange={() => guardar.mutate({ ...r, [a.campo]: !r[a.campo] })}
                      className="h-3.5 w-3.5 accent-accion" />
                    {a.texto}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {disponibles.length > 0 && (
        <div className="border-t border-linea pt-4">
          <Campo etiqueta="Agregar una persona">
            <Selector valor="" onChange={(v) => v && guardar.mutate({
              usuario_id: Number(v),
              nombre: disponibles.find((u) => u.id === Number(v))!.nombre,
              puede_avanzar: true, puede_devolver: true,
              puede_rechazar: false, puede_cerrar: false, puede_acotar: false,
            })} opciones={[
              { valor: '', texto: 'Seleccione una persona…' },
              ...disponibles.map((u) => ({ valor: String(u.id), texto: u.nombre })),
            ]} />
          </Campo>
        </div>
      )}
    </Modal>
  );
}
