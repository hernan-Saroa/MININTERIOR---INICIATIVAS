import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Lock, Trash2 } from 'lucide-react';
import { api, ErrorApi } from '../api/cliente';
import type { Rol } from '../api/tipos';
import {
  Boton, Tarjeta, Epigrafe, Campo, Texto, AreaTexto, Modal,
  Cargando, Aviso, Insignia, ErrorPantalla
} from '../ui/base';

export function Roles() {
  const [editando, setEditando] = useState<Rol | 'nuevo' | null>(null);
  const { data: roles, isLoading, isError, error, refetch } = useQuery({ queryKey: ['roles'], queryFn: api.roles });

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Epigrafe>Administración</Epigrafe>
          <h1 className="titulo mt-1.5 text-[26px] leading-tight sm:text-[30px]">Roles y permisos</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-tenue">
            Los permisos los define el sistema: cada uno existe porque hay código que
            lo verifica. Los roles los arma usted, con el nombre y la combinación
            que necesite.
          </p>
        </div>
        <Boton onClick={() => setEditando('nuevo')}><Plus size={15} /> Crear rol</Boton>
      </header>

      {isLoading ? <Cargando texto="Cargando roles" /> : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {(roles ?? []).map((r) => (
            <Tarjeta key={r.id} className="flex flex-col p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[14.5px] font-bold leading-snug">
                    {r.nombre}
                    {r.es_sistema && (
                      <span title="Rol del sistema: no se puede eliminar">
                        <Lock size={12} className="text-tenue" />
                      </span>
                    )}
                  </p>
                  <p className="clave mt-0.5 block">{r.clave}</p>
                </div>
                <Insignia color={r.usuarios > 0 ? 'azul' : 'gris'} tamano="chico">
                  {r.usuarios} {r.usuarios === 1 ? 'usuario' : 'usuarios'}
                </Insignia>
              </div>

              <p className="mb-3 text-[13px] leading-relaxed text-tenue">{r.descripcion}</p>

              <ul className="mb-4 flex flex-wrap gap-1">
                {r.permisos.slice(0, 6).map((p) => (
                  <li key={p} className="clave rounded bg-panel-2 px-1.5 py-0.5 ring-1 ring-linea">{p}</li>
                ))}
                {r.permisos.length > 6 && (
                  <li className="clave px-1 py-0.5 text-tenue">+{r.permisos.length - 6} más</li>
                )}
              </ul>

              <div className="mt-auto">
                <Boton tamano="chico" variante="secundario" onClick={() => setEditando(r)}>
                  {r.es_sistema ? 'Ver permisos' : 'Editar rol'}
                </Boton>
              </div>
            </Tarjeta>
          ))}
        </div>
      )}

      {editando && (
        <ModalRol
          rol={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function ModalRol({ rol, onCerrar }: { rol: Rol | null; onCerrar: () => void }) {
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '');
  const [elegidos, setElegidos] = useState<string[]>(rol?.permisos ?? []);
  const [error, setError] = useState('');
  const clienteConsultas = useQueryClient();

  const { data: permisos } = useQuery({ queryKey: ['permisos'], queryFn: api.permisos });
  const bloqueado = rol?.es_sistema ?? false;

  const grupos = (permisos ?? []).reduce<Record<string, typeof permisos>>((acc, p) => {
    (acc[p.grupo] ??= [])!.push(p);
    return acc;
  }, {});

  const guardar = useMutation({
    mutationFn: () => api.guardarRol({ id: rol?.id, nombre, descripcion, permisos: elegidos }),
    onSuccess: () => { clienteConsultas.invalidateQueries(); onCerrar(); },
    onError: (e: ErrorApi) => setError(e.message),
  });

  const eliminar = useMutation({
    mutationFn: () => api.eliminarRol(rol!.id),
    onSuccess: () => { clienteConsultas.invalidateQueries(); onCerrar(); },
    onError: (e: ErrorApi) => setError(e.message),
  });

  function alternar(clave: string) {
    setElegidos((prev) => prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]);
  }

  return (
    <Modal
      titulo={rol ? rol.nombre : 'Crear un rol'}
      descripcion={bloqueado
        ? 'Es un rol del sistema: se puede consultar, pero no modificar ni eliminar.'
        : 'Póngale un nombre reconocible y marque lo que debe poder hacer.'}
      onCerrar={onCerrar}
      pie={
        <>
          {rol && !bloqueado && (
            <div className="sm:mr-auto">
              {/* Dos pasos, no uno. Borrar un rol deja sin permisos a todo el
                  que lo tenga, no se puede deshacer, y el botón está a
                  distancia de pulgar del de «Cancelar» en el pie del móvil. */}
              {confirmandoBorrado ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-[12.5px] font-semibold leading-snug text-rojo">
                    {rol.usuarios > 0
                      ? `${rol.usuarios} ${rol.usuarios === 1 ? 'persona' : 'personas'} `
                        + `${rol.usuarios === 1 ? 'quedará' : 'quedarán'} sin permisos. ¿Seguro?`
                      : '¿Eliminar este rol? No se puede deshacer.'}
                  </span>
                  <div className="flex gap-2">
                    <Boton variante="secundario" tamano="chico"
                      onClick={() => setConfirmandoBorrado(false)}>
                      No, conservarlo
                    </Boton>
                    <Boton variante="peligro" tamano="chico"
                      onClick={() => eliminar.mutate()} disabled={eliminar.isPending}>
                      {eliminar.isPending ? 'Eliminando…' : 'Sí, eliminar'}
                    </Boton>
                  </div>
                </div>
              ) : (
                <Boton variante="peligro" onClick={() => setConfirmandoBorrado(true)}>
                  <Trash2 size={14} /> Eliminar
                </Boton>
              )}
            </div>
          )}
          <Boton variante="secundario" onClick={onCerrar}>{bloqueado ? 'Cerrar' : 'Cancelar'}</Boton>
          {!bloqueado && (
            <Boton disabled={guardar.isPending || !nombre.trim()} onClick={() => guardar.mutate()}>
              {guardar.isPending ? 'Guardando' : 'Guardar rol'}
            </Boton>
          )}
        </>
      }
    >
      {error && <Aviso tipo="error">{error}</Aviso>}

      {!bloqueado && (
        <>
          <Campo etiqueta="Nombre del rol" pista="Como lo van a reconocer quienes administran usuarios.">
            <Texto valor={nombre} onChange={setNombre} placeholder="Por ejemplo: Enlace legislativo" />
          </Campo>
          <Campo etiqueta="Para qué sirve">
            <AreaTexto valor={descripcion} onChange={setDescripcion} filas={2}
              placeholder="Una línea que explique cuándo se asigna este rol." />
          </Campo>
        </>
      )}

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <Epigrafe>Permisos</Epigrafe>
          <span className="cifras text-[12px] text-tenue">
            {elegidos.length} de {permisos?.length ?? 0}
          </span>
        </div>

        <div className="space-y-4">
          {Object.entries(grupos).map(([grupo, lista]) => (
            <fieldset key={grupo}>
              <legend className="mb-1.5 text-[12px] font-bold">{grupo}</legend>
              <div className="overflow-hidden rounded-md ring-1 ring-linea">
                {(lista ?? []).map((p, i) => {
                  const marcado = elegidos.includes(p.clave);
                  return (
                    <label key={p.clave}
                      className={`flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors ${
                        i > 0 ? 'border-t border-linea' : ''
                      } ${marcado ? 'bg-accion-tenue' : 'bg-panel hover:bg-panel-2'} ${
                        bloqueado ? 'cursor-default' : ''
                      }`}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={bloqueado}
                        onChange={() => alternar(p.clave)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-accion"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-snug">{p.nombre}</span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-tenue">{p.descripcion}</span>
                        <span className="clave mt-0.5 block">{p.clave}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </Modal>
  );
}
