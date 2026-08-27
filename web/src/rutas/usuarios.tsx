import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCheck, Search, Sliders } from 'lucide-react';
import { api, ErrorApi } from '../api/cliente';
import type { Usuario } from '../api/tipos';
import {
  Boton, Tarjeta, Epigrafe, Campo, Selector, Modal, Cargando,
  Vacio, Aviso, Insignia, Texto, Interruptor, ErrorPantalla
} from '../ui/base';

export function Usuarios() {
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Usuario | null>(null);
  const clienteConsultas = useQueryClient();

  const { data: usuarios, isLoading, isError, error, refetch } = useQuery({ queryKey: ['usuarios'], queryFn: api.usuarios });
  const { data: config } = useQuery({ queryKey: ['configuracion'], queryFn: api.configuracion });

  const mutacionConfig = useMutation({
    mutationFn: (cambios: { exigir_aprobacion_manual: boolean }) => api.guardarConfiguracion(cambios),
    onSuccess: () => {
      clienteConsultas.invalidateQueries({ queryKey: ['configuracion'] });
    },
  });

  const pendientes = (usuarios ?? []).filter((u) => u.pendiente_aprobacion);
  const filtrados = (usuarios ?? []).filter((u) => {
    const t = busqueda.trim().toLowerCase();
    return !t || u.nombre.toLowerCase().includes(t) || u.correo.toLowerCase().includes(t);
  });

  return (
    <div>
      <header className="mb-6">
        <Epigrafe>Administración</Epigrafe>
        <h1 className="titulo mt-1.5 text-[26px] leading-tight sm:text-[30px]">Usuarios</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-tenue">
          Quién tiene cuenta, con qué rol y en qué dirección. Las cuentas que
          se autorregistraron esperan aquí a que alguien les asigne permisos.
        </p>
      </header>

      {/* Configuración de políticas de registro */}
      <Tarjeta className="mb-5 border-linea bg-panel-2 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-tinta">
              <Sliders size={15} className="text-accion" />
              Aprobación de nuevas cuentas autorregistradas
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-tenue">
              {config?.exigir_aprobacion_manual
                ? 'Las personas que se registren deberán ser aprobadas manualmente por un administrador antes de tener permisos plenos.'
                : 'Cualquier persona que se registre quedará aprobada y activa automáticamente sin requerir validación manual.'}
            </p>
          </div>
          <div className="shrink-0">
            <Interruptor
              activo={config?.exigir_aprobacion_manual ?? true}
              onChange={(v) => mutacionConfig.mutate({ exigir_aprobacion_manual: v })}
              etiqueta={config?.exigir_aprobacion_manual ? 'Exigir aprobación manual' : 'Auto-aprobación activa'}
            />
          </div>
        </div>
      </Tarjeta>

      {pendientes.length > 0 && (
        <div className="mb-5">
          <Aviso tipo="atencion">
            <b className="text-tinta">
              {pendientes.length} {pendientes.length === 1 ? 'cuenta espera' : 'cuentas esperan'} aprobación.
            </b>{' '}
            Mientras no tengan rol y dirección solo pueden consultar; no modifican nada.
          </Aviso>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 rounded-md border border-linea bg-panel px-3">
        <Search size={15} className="shrink-0 text-tenue" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o correo"
          className="w-full bg-transparent py-2.5 text-[14px] placeholder:text-tenue/70 focus:outline-none"
        />
      </div>

      {isError ? (
        <ErrorPantalla error={error} onReintentar={() => refetch()} />
      ) : isLoading ? (
        <Cargando texto="Cargando usuarios" />
      ) : filtrados.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="Ningún usuario coincide"
            detalle="Pruebe con parte del nombre o del correo institucional." />
        </Tarjeta>
      ) : (
        <ul className="space-y-2.5">
          {filtrados.map((u) => (
            <li key={u.id}>
              <Tarjeta className={`p-4 ${u.pendiente_aprobacion ? 'border-l-[3px] border-l-ambar' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold leading-snug">
                      {u.nombre}
                      {!u.activo && <Insignia color="gris" tamano="chico">inactiva</Insignia>}
                      {u.pendiente_aprobacion && <Insignia color="ambar" tamano="chico">pendiente</Insignia>}
                    </p>
                    <p className="clave mt-0.5 block">{u.correo}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-tenue">
                      <span className="font-semibold text-tinta-2">{u.rol_nombre}</span>
                      <span>{u.direccion_nombre ?? 'Sin dirección asignada'}</span>
                      <span className="cifras">
                        {u.ultimo_ingreso ? `Último ingreso ${u.ultimo_ingreso}` : 'Nunca ha ingresado'}
                      </span>
                    </p>
                  </div>
                  <Boton tamano="chico"
                    variante={u.pendiente_aprobacion ? 'principal' : 'secundario'}
                    onClick={() => setEditando(u)}>
                    {u.pendiente_aprobacion ? <><UserCheck size={13} /> Aprobar</> : 'Editar'}
                  </Boton>
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      {editando && <ModalUsuario usuario={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function ModalUsuario({ usuario, onCerrar }: { usuario: Usuario; onCerrar: () => void }) {
  const [rolId, setRolId] = useState(usuario.rol_id);
  const [direccionId, setDireccionId] = useState(usuario.direccion_id ?? '');
  const [activo, setActivo] = useState(usuario.activo);
  const [error, setError] = useState('');
  const clienteConsultas = useQueryClient();

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: api.roles });
  const { data: direcciones } = useQuery({ queryKey: ['direcciones'], queryFn: api.direcciones });

  const guardar = useMutation({
    mutationFn: () => api.guardarUsuario(usuario.id, {
      rol_id: rolId,
      direccion_id: direccionId || null,
      activo,
      pendiente_aprobacion: false,
    }),
    onSuccess: () => {
      clienteConsultas.invalidateQueries();
      onCerrar();
    },
    onError: (e: ErrorApi) => setError(e.message),
  });

  const rol = roles?.find((r) => r.id === rolId);

  return (
    <Modal
      titulo={usuario.pendiente_aprobacion ? 'Aprobar la cuenta' : 'Editar usuario'}
      descripcion={usuario.nombre}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando' : 'Guardar cambios'}
          </Boton>
        </>
      }
    >
      {error && <Aviso tipo="error">{error}</Aviso>}

      <Campo etiqueta="Correo">
        <Texto valor={usuario.correo} onChange={() => {}} />
      </Campo>

      <Campo etiqueta="Rol" pista="Define qué puede hacer en el sistema.">
        <Selector valor={rolId} onChange={(v) => setRolId(Number(v))}
          opciones={(roles ?? []).map((r) => ({ valor: r.id, texto: r.nombre }))} />
      </Campo>

      {rol && (
        <div className="rounded-md bg-panel-2 p-3">
          <Epigrafe>Este rol incluye</Epigrafe>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {rol.permisos.map((p) => (
              <li key={p} className="clave rounded bg-panel px-1.5 py-0.5 ring-1 ring-linea">{p}</li>
            ))}
          </ul>
        </div>
      )}

      <Campo etiqueta="Dirección" pista="Define dónde puede ejercer esos permisos.">
        <Selector valor={direccionId} onChange={setDireccionId}
          opciones={[
            { valor: '', texto: 'Sin dirección (todas)' },
            ...(direcciones ?? []).map((d) => ({ valor: d.id, texto: d.nombre_corto })),
          ]} />
      </Campo>

      <Campo etiqueta="Estado de la cuenta">
        <Selector valor={activo ? '1' : '0'} onChange={(v) => setActivo(v === '1')}
          opciones={[
            { valor: '1', texto: 'Activa' },
            { valor: '0', texto: 'Inactiva — no puede ingresar' },
          ]} />
      </Campo>
    </Modal>
  );
}
