// Comprueba en el DOM real el comportamiento de foco de los diálogos.
//
// Estas cuatro cosas se rompieron una vez cada una durante el desarrollo, y
// ninguna se ve leyendo el código: hay que abrir el diálogo y medir.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const app = readFileSync('dist-test/app.js', 'utf8');
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body><div id="raiz"></div><script>${app}<\/script></body></html>`;

let fallos = 0;
const ok = (n, c, extra) => {
  console.log((c ? '  OK    ' : '  FALLA ') + n + (extra ? '  ' + extra : ''));
  if (!c) fallos++;
};

async function montar(ruta) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'http://localhost' + ruta, virtualConsole: vc,
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const g of ['Request', 'Response', 'Headers', 'fetch', 'AbortController', 'FormData']) {
    if (!w[g] && globalThis[g]) w[g] = globalThis[g];
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { w, d: w.document, raiz: w.document.getElementById('raiz') };
}

const { w, d, raiz } = await montar('/');

console.log('\nCon el panel de flujo cerrado');
ok('nada está marcado inert', [...raiz.querySelectorAll('*')].every((e) => e.inert !== true));

// Abrir el panel pulsando la píldora de estado.
raiz.querySelector('.estado-btn')?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 700));

const dialogo = d.querySelector('[role="dialog"]');
ok('el panel se abrió', !!dialogo);
ok('declara aria-modal', dialogo?.getAttribute('aria-modal') === 'true');

console.log('\ninert: el fondo se retira, la región viva no');
const hijos = [...raiz.children];
const inertes = hijos.filter((h) => h.inert === true);
const viva = hijos.find((h) => h.hasAttribute('data-region-viva'));
ok('hay hermanos marcados inert', inertes.length > 0, `(${inertes.length} de ${hijos.length})`);
ok('el que contiene el diálogo NO es inert',
   hijos.filter((h) => h.contains(dialogo)).every((h) => h.inert !== true));
ok('la región viva NO es inert', !!viva && viva.inert !== true);
ok('ningún ancestro del diálogo es inert', (() => {
  let n = dialogo?.parentElement;
  while (n && n !== d.body) { if (n.inert === true) return false; n = n.parentElement; }
  return true;
})());

console.log('\nTrampa de foco con el foco perdido en <body>');
d.body.focus?.();
if (d.activeElement && d.activeElement !== d.body) d.activeElement.blur();
ok('el foco está fuera del panel', !dialogo?.contains(d.activeElement));

const tab = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
d.dispatchEvent(tab);
ok('Tab se intercepta y no se escapa al fondo', tab.defaultPrevented);
ok('el foco volvió DENTRO del panel', !!dialogo?.contains(d.activeElement),
   '(' + (d.activeElement?.tagName ?? '?') + ')');

const shift = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
d.dispatchEvent(shift);
ok('Shift+Tab también se mantiene dentro', !!dialogo?.contains(d.activeElement));

console.log('\nEscape cierra el panel');
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 400));
ok('el panel se cerró', !d.querySelector('[role="dialog"]'));
ok('el inert se retiró al cerrar', [...raiz.children].every((h) => h.inert !== true));

w.close();
console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
