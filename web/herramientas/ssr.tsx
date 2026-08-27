// Solo para revisión visual: renderiza cada pantalla a HTML estático con
// los datos ya resueltos, para poder capturarla e inspeccionar el diseño.
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { api } from '../src/api/cliente';
import { Estructura } from '../src/ui/estructura';
import { Tablero } from '../src/rutas/tablero';
import { Usuarios } from '../src/rutas/usuarios';
import { Roles } from '../src/rutas/roles';
import { Flujo } from '../src/rutas/flujo';
import { Estadisticas } from '../src/rutas/estadisticas';

const PANTALLAS = [
  { nombre: 'publico', ruta: '/publico' },
  { nombre: 'tablero', ruta: '/' },
  { nombre: 'usuarios', ruta: '/admin/usuarios' },
  { nombre: 'roles', ruta: '/admin/roles' },
  { nombre: 'flujo', ruta: '/admin/flujo' },
  { nombre: 'estadisticas', ruta: '/admin/estadisticas' },
];

function css(): string {
  const dir = 'dist/assets';
  try {
    const archivo = readdirSync(dir).find((f) => f.endsWith('.css'));
    if (archivo) return readFileSync(`${dir}/${archivo}`, 'utf8');
  } catch { /* el build de un solo archivo incrusta el CSS */ }
  const html = readFileSync('dist/index.html', 'utf8');
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

async function main() {
  const hoja = css();
  console.log('CSS:', hoja.length, 'bytes');

  for (const p of PANTALLAS) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await Promise.all([
      qc.prefetchQuery({ queryKey: ['sesion'], queryFn: api.sesion }),
      qc.prefetchQuery({ queryKey: ['direcciones'], queryFn: api.direcciones }),
      qc.prefetchQuery({ queryKey: ['estados'], queryFn: api.estados }),
      qc.prefetchQuery({ queryKey: ['usuarios'], queryFn: api.usuarios }),
      qc.prefetchQuery({ queryKey: ['usuarios-simples'], queryFn: api.usuariosSimples }),
      qc.prefetchQuery({ queryKey: ['roles'], queryFn: api.roles }),
      qc.prefetchQuery({ queryKey: ['permisos'], queryFn: api.permisos }),
      qc.prefetchQuery({ queryKey: ['estadisticas'], queryFn: api.estadisticas }),
      qc.prefetchQuery({ queryKey: ['direcciones-publicas'], queryFn: api.direccionesPublicas }),
      qc.prefetchQuery({ queryKey: ['flujo-publico'], queryFn: api.flujoPublico }),
      qc.prefetchQuery({ queryKey: ['iniciativas', 'dialogo'], queryFn: () => api.iniciativas('dialogo') }),
      qc.prefetchQuery({ queryKey: ['iniciativas', 'ddhh'], queryFn: () => api.iniciativas('ddhh') }),
      qc.prefetchQuery({ queryKey: ['iniciativas', undefined], queryFn: () => api.iniciativas() }),
    ]);

    const marcado = renderToString(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[p.ruta]}>
          <Routes>
            <Route path="/" element={<Tablero />} />
            <Route path="/publico" element={<Tablero publico />} />
            <Route path="/admin" element={<Estructura />}>
              <Route path="estadisticas" element={<Estadisticas />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="roles" element={<Roles />} />
              <Route path="flujo" element={<Flujo />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    writeFileSync(
      `/tmp/ssr-${p.nombre}.html`,
      `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>${hoja}</style></head><body>${marcado}</body></html>`,
    );
    console.log('  escrito /tmp/ssr-' + p.nombre + '.html', marcado.length, 'bytes');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
