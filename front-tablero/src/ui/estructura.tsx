import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutList, BarChart3, Users, Shield, Workflow, LogOut, Lock } from 'lucide-react';
import { api } from '../api/cliente';
import { Aviso, Boton } from '../ui/base';
import { ModalAuth } from '../ui/modal-auth';

// =====================================================================
// Estructura. En móvil la navegación va abajo, al alcance del pulgar;
// en escritorio pasa a una columna lateral. Las entradas se filtran por
// permiso: nadie ve una pestaña que le va a devolver un 403.
// =====================================================================

const ENTRADAS = [
  { a: '/admin/usuarios', icono: Users, texto: 'Usuarios', corto: 'Usuarios', permiso: 'usuarios.ver' },
  { a: '/admin/roles', icono: Shield, texto: 'Roles y permisos', corto: 'Roles', permiso: 'roles.administrar' },
  { a: '/admin/flujo', icono: Workflow, texto: 'Flujo de estados', corto: 'Flujo', permiso: 'flujo.configurar' },
  { a: '/admin/estadisticas', icono: BarChart3, texto: 'Estadísticas', corto: 'Datos', permiso: 'estadisticas.ver' },
];

// Aquí vivía un desplegable «Ver la aplicación como» con la lista de
// usuarios, que se ofrecía a cualquiera que llegara a /admin sin filtrar por
// ningún permiso. Se retiró por tres razones:
//
//   · Era un control de SUPLANTACIÓN DE IDENTIDAD sin restricción alguna.
//   · No funcionaba: `api.cambiarUsuario` era el único método del cliente sin
//     rama contra la API real, así que operaba sobre los datos del simulador,
//     no encontraba al usuario y reventaba al leer su rol.
//   · Y aunque hubiera funcionado, reescribía la sesión solo en el navegador:
//     el servidor seguía viendo a la persona de verdad.
//
// Suplantar a alguien para depurar es legítimo, pero necesita soporte del
// servidor y quedar registrado en la bitácora de configuración. Mientras eso
// no exista, no hay control.
export function Estructura() {
  const { data: sesion, isLoading } = useQuery({ queryKey: ['sesion'], queryFn: api.sesion });
  const clienteConsultas = useQueryClient();
  const [modalLogin, setModalLogin] = useState(false);
  const ubicacion = useLocation();
  const navegar = useNavigate();

  const permitidas = ENTRADAS.filter((e) => sesion?.permisos?.includes(e.permiso));

  async function salir() {
    await api.salir();
    clienteConsultas.invalidateQueries();
    navegar('/');
  }

  if (!isLoading && !sesion) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-papel p-6 text-center">
        <div className="w-full max-w-md rounded-[10px] border border-linea bg-panel p-8 shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accion-tenue text-accion">
            <Lock size={24} />
          </div>
          <h2 className="titulo text-[18px] text-tinta">Acceso restringido</h2>
          <p className="mb-6 mt-2 text-[13.5px] leading-relaxed text-tenue">
            Para acceder a la zona de administración debe iniciar sesión con una cuenta autorizada.
          </p>
          <div className="flex flex-col gap-2.5">
            <Boton variante="principal" onClick={() => setModalLogin(true)}>
              Iniciar sesión
            </Boton>
            <Link to="/" className="text-[13px] font-semibold text-tenue hover:text-tinta">
              Volver al tablero
            </Link>
          </div>
        </div>
        {modalLogin && (
          <ModalAuth
            onCerrar={() => setModalLogin(false)}
            onExito={() => {
              clienteConsultas.invalidateQueries();
              setModalLogin(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh sm:flex">
      {/* Columna lateral, solo en escritorio */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-700 bg-navy-800 sm:flex">
        <div className="border-b border-navy-700 bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <img
              src="/logo-mininterior.png"
              alt="Logo Ministerio del Interior"
              className="h-10 w-auto object-contain"
            />
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-500">
                Ministerio del Interior
              </p>
              <p className="text-[12.5px] font-bold text-slate-900">
                Administración
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3">
          {permitidas.map((e) => (
            <NavLink key={e.a} to={e.a}
              className={({ isActive }) => `mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                isActive ? 'bg-accion text-white' : 'text-slate-300 hover:bg-navy-700 hover:text-white'
              }`}>
              <e.icono size={16} strokeWidth={2} />
              {e.texto}
            </NavLink>
          ))}
          <NavLink to="/"
            className="mt-3 flex items-center gap-2.5 rounded-md border border-navy-700 px-3 py-2.5 text-[12.5px] text-slate-400 hover:border-slate-500 hover:text-white">
            <LayoutList size={14} strokeWidth={2} />
            Volver al tablero
          </NavLink>
        </nav>

        {/* Identidad de la persona que tiene la sesión.
            Es texto, no un botón: al retirar el desplegable de suplantación
            no queda nada que desplegar, y un control con chevron que no abre
            nada enseña a la gente a desconfiar de los controles. */}
        <div className="border-t border-navy-700 p-3">
          <div className="p-2">
            <p className="truncate text-[12.5px] font-bold text-white">{sesion?.nombre}</p>
            <p className="truncate text-[11px] text-slate-300">{sesion?.rol_nombre}</p>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-navy-700/60 pt-2 text-[11px]">
            <span className="text-slate-300">Entidad pública</span>
            <button
              onClick={salir}
              className="inline-flex items-center gap-1 font-medium text-slate-300 hover:text-red-300"
              title="Cerrar sesión"
            >
              <LogOut size={12} /> Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior, solo en móvil */}
        <header className="flex items-center justify-between gap-3 border-b border-linea bg-white px-4 py-2.5 sm:hidden">
          <div className="flex items-center gap-2.5">
            <img src="/logo-mininterior.png" alt="Logo Ministerio del Interior" className="h-8 w-auto object-contain" />
            <p className="text-[12.5px] font-bold text-slate-900">Administración</p>
          </div>
          <div className="flex items-center gap-2">
            {/* «Volver al tablero» solo existía en la barra lateral, que en
                móvil está oculta: desde el teléfono no había ninguna forma
                de salir de /admin sin editar la URL a mano. El nombre de la
                persona se retiró de aquí para hacerle sitio —ya está en la
                barra lateral y en el tablero— porque en una pantalla de
                360 px los tres controles no caben y el enlace de salida
                importa más que el saludo. */}
            <Link to="/"
              title="Volver al tablero de iniciativas"
              className="flex min-h-[36px] items-center gap-1.5 rounded border border-linea px-2.5 py-1 text-[11.5px] font-semibold text-slate-700">
              <LayoutList size={13} strokeWidth={2} />
              Tablero
            </Link>
            <button onClick={salir} title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-linea text-[11.5px] text-slate-700">
              <LogOut size={13} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
          <div className="mx-auto max-w-6xl">
            {sesion?.pendiente_aprobacion && (
              <div className="mb-5">
                <Aviso tipo="atencion">
                  <b className="text-tinta">Su cuenta está pendiente de aprobación.</b> Puede consultar
                  el tablero y ver sus propuestas marcadas, pero aún no puede modificar nada.
                  Un administrador le asignará dirección y permisos.
                </Aviso>
              </div>
            )}
            <Outlet key={ubicacion.pathname} />
          </div>
        </main>

        {/* Navegación inferior, solo en móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-linea bg-panel/97 backdrop-blur sm:hidden">
          {permitidas.map((e) => (
            <NavLink key={e.a} to={e.a}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
                isActive ? 'text-accion' : 'text-tenue'
              }`}>
              <e.icono size={19} strokeWidth={2} />
              {e.corto}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}


