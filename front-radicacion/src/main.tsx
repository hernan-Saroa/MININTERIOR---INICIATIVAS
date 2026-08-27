import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LimiteError } from './ui/limite-error';
import { PortalRadicacion } from './paginas/PortalRadicacion';

import './estilos.css';

const clienteConsultas = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5000 } },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <LimiteError>
      <QueryClientProvider client={clienteConsultas}>
        <PortalRadicacion />
      </QueryClientProvider>
    </LimiteError>
  </StrictMode>,
);
