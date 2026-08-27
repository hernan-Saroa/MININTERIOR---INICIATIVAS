import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ErrorApi } from '../api/cliente';
import { Modal, Campo, Texto, Boton, Aviso } from './base';
import { Mail, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export type ModoAuth = 'ingresar' | 'registrar' | 'solicitar_recuperacion' | 'restablecer' | 'cambiar';

interface ModalAuthProps {
  modoInicial?: ModoAuth;
  tokenInicial?: string;
  onCerrar: () => void;
  onExito?: () => void;
}

// Aquí vivía una lista de «usuarios de prueba» con los correos
// institucionales reales y su rol, pintada como botones en la pantalla de
// acceso. Se retiró: publicaba a cualquier visitante qué cuentas existen
// y cuál es la del Viceministro, que es la mitad del camino para tomarla.
//
// Para entrar en desarrollo, use una cuenta real de la base de datos de
// pruebas; las credenciales de siembra están en db/03_datos_iniciales.sql
// y en INSTALACION.md, que no se sirven al navegador.

export function ModalAuth({
  modoInicial = 'ingresar',
  tokenInicial = '',
  onCerrar,
  onExito,
}: ModalAuthProps) {
  const [modo, setModo] = useState<ModoAuth>(modoInicial);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [nombre, setNombre] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [actual, setActual] = useState('');
  const [mostrarActual, setMostrarActual] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [tokenRecuperacion, setTokenRecuperacion] = useState(tokenInicial);
  const [enlaceGenerado, setEnlaceGenerado] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (tokenInicial) {
      setTokenRecuperacion(tokenInicial);
      setModo('restablecer');
    }
  }, [tokenInicial]);

  const mutacionIngresar = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!correo.trim() || !contrasena.trim()) {
        throw new Error('Ingrese su correo y contraseña');
      }
      return api.ingresar(correo, contrasena);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      onExito?.();
      onCerrar();
    },
    onError: (err: ErrorApi | Error) => {
      setError(err.message || 'Error al iniciar sesión');
    },
  });

  const mutacionRegistrar = useMutation({
    mutationFn: async () => {
      setError(null);
      if (!nombre.trim()) throw new Error('Escriba su nombre completo');
      if (!correo.trim()) throw new Error('Escriba su correo electrónico');
      if (contrasena.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres');
      if (!/[0-9]/.test(contrasena)) throw new Error('La contraseña debe incluir al menos un número');
      if (contrasena !== confirmar) throw new Error('Las contraseñas no coinciden');

      return api.registrar({ nombre, correo, contrasena });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      onExito?.();
      onCerrar();
    },
    onError: (err: ErrorApi | Error) => {
      setError(err.message || 'Error al registrar la cuenta');
    },
  });

  const mutacionSolicitarRecuperacion = useMutation({
    mutationFn: async () => {
      setError(null);
      setMensajeExito(null);
      if (!correo.trim()) throw new Error('Ingrese su correo electrónico');
      return api.solicitarRecuperacion(correo);
    },
    onSuccess: (res) => {
      // El servidor solo devuelve el enlace si la máquina lo autoriza
      // (desarrollo). En producción no llega, y no debe llegar: sin
      // envío de correo, mostrarlo en pantalla permitiría pedir el
      // enlace de una cuenta ajena y usarlo al instante.
      setEnlaceGenerado(res.enlace ?? null);
      setTokenRecuperacion(res.token ?? '');
      setMensajeExito(res.mensaje);
    },
    onError: (err: ErrorApi | Error) => {
      setError(err.message || 'No fue posible procesar la solicitud');
    },
  });

  const mutacionRestablecer = useMutation({
    mutationFn: async () => {
      setError(null);
      setMensajeExito(null);
      if (!tokenRecuperacion) throw new Error('Falta el token de recuperación');
      if (contrasena.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres');
      if (!/[0-9]/.test(contrasena)) throw new Error('La contraseña debe incluir al menos un número');
      if (contrasena !== confirmar) throw new Error('Las contraseñas no coinciden');

      return api.restablecerContrasena(tokenRecuperacion, contrasena);
    },
    onSuccess: (res) => {
      setMensajeExito('✓ Contraseña actualizada correctamente. Ya puede ingresar.');
      setModo('ingresar');
      setContrasena('');
      setConfirmar('');
      setCorreo(res.correo);
    },
    onError: (err: ErrorApi | Error) => {
      setError(err.message || 'No fue posible restablecer la contraseña');
    },
  });

  // Cambiar la propia contraseña estando dentro. El endpoint existía y
  // ninguna pantalla lo llamaba: quien recibía una contraseña provisional
  // quedaba en solo lectura permanente, porque `debe_cambiar` bloquea toda
  // escritura y no había forma de quitárselo.
  const mutacionCambiar = useMutation({
    mutationFn: async () => {
      setError(null);
      setMensajeExito(null);
      if (!actual) throw new Error('Escriba su contraseña actual');
      // Las mismas reglas que aplica auth/contrasena.js en el servidor, para
      // que el error salga antes de la ida y vuelta.
      if (contrasena.length < 12) throw new Error('La nueva contraseña debe tener al menos 12 caracteres');
      if (!/[a-záéíóúñ]/i.test(contrasena)) throw new Error('La nueva contraseña debe incluir letras');
      if (!/[0-9]/.test(contrasena)) throw new Error('La nueva contraseña debe incluir al menos un número');
      if (contrasena === actual) throw new Error('La nueva contraseña debe ser distinta de la actual');
      if (contrasena !== confirmar) throw new Error('Las contraseñas no coinciden');
      return api.cambiarContrasena(actual, contrasena);
    },
    onSuccess: () => {
      // Se relee la sesión: el servidor acaba de bajar `debe_cambiar`, y de
      // eso depende que se pueda volver a escribir.
      queryClient.invalidateQueries({ queryKey: ['sesion'] });
      setActual('');
      setContrasena('');
      setConfirmar('');
      setMensajeExito('✓ Contraseña actualizada. Ya puede modificar información.');
      onExito?.();
    },
    onError: (err: ErrorApi | Error) => {
      setError(err.message || 'No fue posible cambiar la contraseña');
    },
  });

  const cargando =
    mutacionCambiar.isPending ||
    mutacionIngresar.isPending ||
    mutacionRegistrar.isPending ||
    mutacionSolicitarRecuperacion.isPending ||
    mutacionRestablecer.isPending;

  function cambiarModo(nuevoModo: ModoAuth) {
    setModo(nuevoModo);
    setError(null);
    setMensajeExito(null);
  }

  const titulos = {
    ingresar: 'Iniciar sesión',
    registrar: 'Registrar nueva cuenta',
    solicitar_recuperacion: 'Recuperar contraseña',
    restablecer: 'Establecer nueva contraseña',
    cambiar: 'Cambiar su contraseña',
  };

  const descripciones = {
    ingresar: 'Ingrese con su cuenta institucional o personal para acceder al tablero y sus funcionalidades.',
    registrar: 'Cree una cuenta para hacer seguimiento a las iniciativas legislativas y enviar propuestas.',
    solicitar_recuperacion: 'Ingrese el correo registrado. Un administrador le entregará el enlace para restablecer la contraseña: todavía no se envía por correo automáticamente.',
    restablecer: 'Defina una nueva contraseña segura para su cuenta.',
    cambiar: 'Mientras use la contraseña provisional puede consultar el tablero, '
           + 'pero no modificar información. Al cambiarla se habilita la escritura.',
  };

  return (
    <Modal
      titulo={titulos[modo]}
      descripcion={descripciones[modo]}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Boton>
          {modo === 'ingresar' && (
            <Boton
              variante="principal"
              disabled={cargando}
              onClick={() => mutacionIngresar.mutate()}
            >
              {cargando ? 'Ingresando…' : 'Iniciar sesión'}
            </Boton>
          )}
          {modo === 'registrar' && (
            <Boton
              variante="principal"
              disabled={cargando}
              onClick={() => mutacionRegistrar.mutate()}
            >
              {cargando ? 'Registrando…' : 'Completar registro'}
            </Boton>
          )}
          {modo === 'solicitar_recuperacion' && (
            <Boton
              variante="principal"
              disabled={cargando}
              onClick={() => mutacionSolicitarRecuperacion.mutate()}
            >
              {cargando ? 'Solicitando…' : 'Solicitar restablecimiento'}
            </Boton>
          )}
          {modo === 'restablecer' && (
            <Boton
              variante="principal"
              disabled={cargando}
              onClick={() => mutacionRestablecer.mutate()}
            >
              {cargando ? 'Guardando…' : 'Cambiar contraseña'}
            </Boton>
          )}
          {modo === 'cambiar' && (
            <Boton
              variante="principal"
              disabled={cargando}
              onClick={() => mutacionCambiar.mutate()}
            >
              {cargando ? 'Guardando…' : 'Guardar contraseña nueva'}
            </Boton>
          )}
        </>
      }
    >
      {error && (
        <Aviso tipo="error">
          <b>Error:</b> {error}
        </Aviso>
      )}

      {mensajeExito && (
        <Aviso tipo="ok">
          {mensajeExito}
        </Aviso>
      )}

      {modo === 'ingresar' && (
        <div className="space-y-4">
          <Campo etiqueta="Correo institucional o electrónico">
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="ejemplo@mininterior.gov.co"
              autoFocus
              className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
            />
          </Campo>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[12px] font-bold tracking-[0.01em]">Contraseña</span>
              <button
                type="button"
                onClick={() => cambiarModo('solicitar_recuperacion')}
                className="text-[11.5px] font-semibold text-accion hover:underline"
              >
                ¿Olvidó su contraseña?
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                type={mostrarClave ? 'text' : 'password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') mutacionIngresar.mutate();
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarClave((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {modo === 'registrar' && (
        <div className="space-y-3.5">
          <Campo etiqueta="Nombre completo" pista="Nombre y apellidos institucionales">
            <Texto
              valor={nombre}
              onChange={setNombre}
              placeholder="Ej. Juan Pérez Gómez"
            />
          </Campo>

          <Campo etiqueta="Correo electrónico" pista="Preferiblemente institucional (@mininterior.gov.co)">
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="juan.perez@mininterior.gov.co"
              className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
            />
          </Campo>

          <Campo
            etiqueta="Contraseña"
            pista="Mínimo 12 caracteres, debe incluir al menos un número"
          >
            <div className="relative flex items-center">
              <input
                type={mostrarClave ? 'text' : 'password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Mínimo 12 caracteres"
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
              />
              <button
                type="button"
                onClick={() => setMostrarClave((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <Campo etiqueta="Confirmar contraseña">
            <div className="relative flex items-center">
              <input
                type={mostrarConfirmar ? 'text' : 'password'}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repita la contraseña"
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') mutacionRegistrar.mutate();
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarConfirmar((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <div className="pt-2 text-center text-[13px] text-tenue">
            ¿Ya tiene una cuenta registrada?{' '}
            <button
              type="button"
              onClick={() => cambiarModo('ingresar')}
              className="font-semibold text-accion hover:underline"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      )}

      {modo === 'solicitar_recuperacion' && (
        <div className="space-y-4">
          <Campo
            etiqueta="Correo registrado"
            pista="Le enviaremos un enlace de un solo uso para reestablecer su clave."
          >
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="su.correo@mininterior.gov.co"
                autoFocus
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') mutacionSolicitarRecuperacion.mutate();
                }}
              />
            </div>
          </Campo>

          {enlaceGenerado && (
            <div className="rounded-lg border border-ambar bg-ambar-tenue p-3.5">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-tinta">
                <Mail size={14} className="text-ambar" /> Enlace de recuperación (solo desarrollo)
              </p>
              <p className="mt-1 break-all text-[11.5px] font-mono text-slate-600">
                {enlaceGenerado}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModo('restablecer');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 rounded bg-accion px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-accion-fuerte"
                >
                  <KeyRound size={12} /> Abrir formulario de nueva contraseña
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 text-center text-[13px] text-tenue">
            ¿Recordó su contraseña?{' '}
            <button
              type="button"
              onClick={() => cambiarModo('ingresar')}
              className="font-semibold text-accion hover:underline"
            >
              Volver a Iniciar sesión
            </button>
          </div>
        </div>
      )}

      {modo === 'restablecer' && (
        <div className="space-y-3.5">
          <Campo
            etiqueta="Nueva contraseña"
            pista="Mínimo 12 caracteres, debe incluir al menos un número"
          >
            <div className="relative flex items-center">
              <input
                type={mostrarClave ? 'text' : 'password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
              />
              <button
                type="button"
                onClick={() => setMostrarClave((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <Campo etiqueta="Confirmar nueva contraseña">
            <div className="relative flex items-center">
              <input
                type={mostrarConfirmar ? 'text' : 'password'}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repita la nueva contraseña"
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') mutacionRestablecer.mutate();
                }}
              />
              <button
                type="button"
                onClick={() => setMostrarConfirmar((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <div className="pt-2 text-center text-[13px] text-tenue">
            <button
              type="button"
              onClick={() => cambiarModo('ingresar')}
              className="inline-flex items-center gap-1 font-semibold text-accion hover:underline"
            >
              <ArrowLeft size={13} /> Volver a Iniciar sesión
            </button>
          </div>
        </div>
      )}
      {modo === 'cambiar' && (
        <div className="space-y-3.5">
          <Campo etiqueta="Contraseña actual">
            <div className="relative flex items-center">
              <input
                type={mostrarActual ? 'text' : 'password'}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="••••••••••••"
                autoFocus
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
              />
              <button
                type="button"
                onClick={() => setMostrarActual((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarActual ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarActual ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarActual ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <Campo etiqueta="Nueva contraseña" pista="Mínimo 12 caracteres, con letras y al menos un número">
            <div className="relative flex items-center">
              <input
                type={mostrarClave ? 'text' : 'password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
              />
              <button
                type="button"
                onClick={() => setMostrarClave((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarClave ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <Campo etiqueta="Confirmar nueva contraseña">
            <div className="relative flex items-center">
              <input
                type={mostrarConfirmar ? 'text' : 'password'}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-linea bg-panel px-3 py-2.5 pr-10 text-[14px] text-tinta placeholder:text-tenue/70 focus:border-accion focus:outline-none focus:ring-[3px] focus:ring-accion/12"
                onKeyDown={(e) => { if (e.key === 'Enter') mutacionCambiar.mutate(); }}
              />
              <button
                type="button"
                onClick={() => setMostrarConfirmar((v) => !v)}
                className="absolute right-2.5 p-1 text-tenue hover:text-tinta transition-colors rounded"
                title={mostrarConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
                aria-label={mostrarConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {mostrarConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>
        </div>
      )}
    </Modal>
  );
}
