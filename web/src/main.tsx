import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createMemoryRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Estructura } from './ui/estructura';
import { LimiteError } from './ui/limite-error';
import { Tablero } from './rutas/tablero';
import { Usuarios } from './rutas/usuarios';
import { Roles } from './rutas/roles';
import { Flujo } from './rutas/flujo';
import { Estadisticas } from './rutas/estadisticas';

import './estilos.css';

const clienteConsultas = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5000 } },
});

// El tablero es el diseño aprobado y ocupa la página completa: tiene su
// propia franja institucional, así que no puede ir dentro del menú lateral
// de administración. Son dos estructuras distintas a propósito.
const definicionRutas = [
  { path: '/', element: <Tablero /> },
  { path: '/publico', element: <Tablero publico /> },
  {
    path: '/admin',
    element: <Estructura />,
    children: [
      { index: true, element: <Navigate to="/admin/usuarios" replace /> },
      { path: 'estadisticas', element: <Estadisticas /> },
      { path: 'usuarios', element: <Usuarios /> },
      { path: 'roles', element: <Roles /> },
      { path: 'flujo', element: <Flujo /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

// El enrutador de navegador necesita una URL http(s) real. Cuando el
// archivo se abre desde el disco o dentro de un iframe sin origen
// (file:, about:srcdoc, blob:), construir esa URL falla y la aplicación
// no monta. En ese caso se usa el enrutador en memoria: se pierde la
// sincronización con la barra de direcciones, pero todo lo demás funciona.
const hayUrlNavegable =
  typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol);

const rutas = hayUrlNavegable
  ? createBrowserRouter(definicionRutas)
  : createMemoryRouter(definicionRutas, { initialEntries: ['/'] });

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <LimiteError>
      <QueryClientProvider client={clienteConsultas}>
        <RouterProvider router={rutas} />
      </QueryClientProvider>
    </LimiteError>
  </StrictMode>,
);
