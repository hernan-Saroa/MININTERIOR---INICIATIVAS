// Comprueba que la aplicación monta tanto con URL http como sin ella
// (el caso del visor de Claude, que la abre en un iframe sin origen).
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const app = readFileSync('dist-test/app.js', 'utf8');
const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div id="raiz"></div><script>${app}<\/script></body></html>`;

let fallos = 0;

for (const url of ['http://localhost/', 'about:blank']) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errores.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const g of ['Request','Response','Headers','fetch','AbortController','FormData'])
    if (!w[g] && globalThis[g]) w[g] = globalThis[g];

  await new Promise((r) => setTimeout(r, 2200));
  const texto = w.document.getElementById('raiz')?.textContent ?? '';
  const monto = texto.includes('Iniciativas Legislativas por Dirección') && texto.includes('Resumen general');
  console.log(`  ${monto ? '✓' : '✗'} ${url.padEnd(18)} monta: ${monto} · errores: ${errores.length}`);
  errores.slice(0, 2).forEach((e) => console.log('      ' + e.split('\n')[0].slice(0, 110)));
  if (!monto || errores.length) fallos++;

  // Cerrar el jsdom. Con USAR_SIMULADO en false queda una petición a /api
  // sin resolver, y eso mantiene vivo el bucle de eventos: el proceso no
  // terminaba nunca y `npm run prueba` se quedaba colgado ahí.
  w.close();
}

process.exit(fallos ? 1 : 0);
