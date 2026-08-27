import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createMemoryRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Estructura } from './ui/estructura';
import { LimiteError } from './ui/limite-error';
import { Usuarios } from './rutas/usuarios';
import { Roles } from './rutas/roles';
import { Flujo } from './rutas/flujo';
import { Estadisticas } from './rutas/estadisticas';

import './estilos.css';

const clienteConsultas = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5000 } },
});

const definicionRutas = [
  {
    path: '/',
    element: <Estructura />,
    children: [
      { index: true, element: <Navigate to="/usuarios" replace /> },
      { path: 'usuarios', element: <Usuarios /> },
      { path: 'roles', element: <Roles /> },
      { path: 'flujo', element: <Flujo /> },
      { path: 'estadisticas', element: <Estadisticas /> },
    ],
  },
  {
    path: '/admin',
    element: <Estructura />,
    children: [
      { index: true, element: <Navigate to="/usuarios" replace /> },
      { path: 'usuarios', element: <Usuarios /> },
      { path: 'roles', element: <Roles /> },
      { path: 'flujo', element: <Flujo /> },
      { path: 'estadisticas', element: <Estadisticas /> },
    ],
  },
  { path: '*', element: <Navigate to="/usuarios" replace /> },
];

const hayUrlNavegable =
  typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol);

const rutas = hayUrlNavegable
  ? createBrowserRouter(definicionRutas)
  : createMemoryRouter(definicionRutas, { initialEntries: ['/usuarios'] });

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <LimiteError>
      <QueryClientProvider client={clienteConsultas}>
        <RouterProvider router={rutas} />
      </QueryClientProvider>
    </LimiteError>
  </StrictMode>,
);
