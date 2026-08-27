// Comprueba en el DOM ya renderizado que la accesibilidad de la ola 3
// llegó a la pantalla, no solo al código fuente.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const app = readFileSync('dist-test/app.js', 'utf8');
const css = readFileSync('dist-test/iniciativas-web.css', 'utf8');
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>${css}</style></head>
<body><div id="raiz"></div><script>${app}<\/script></body></html>`;

const errores = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errores.push(e.message));

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'http://localhost/', virtualConsole: vc,
});
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
for (const g of ['Request', 'Response', 'Headers', 'fetch', 'AbortController', 'FormData']) {
  if (!w[g] && globalThis[g]) w[g] = globalThis[g];
}

await new Promise((r) => setTimeout(r, 2500));
const d = w.document;
const raiz = d.getElementById('raiz');

let fallos = 0;
const ok = (n, c, extra) => {
  console.log((c ? '  OK    ' : '  FALLA ') + n + (extra ? '  ' + extra : ''));
  if (!c) fallos++;
};

console.log('\nPuntos de referencia y navegación');
const salto = [...raiz.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Ir al contenido');
ok('existe el enlace «Ir al contenido»', !!salto);
ok('apunta a un destino que existe', !!salto && !!d.querySelector(salto.getAttribute('href')));
ok('hay un <main>', !!raiz.querySelector('main'));
ok('el <main> es el destino del salto', raiz.querySelector('main')?.id === 'contenido');

console.log('\nRegión viva (WCAG 4.1.3)');
const vivas = raiz.querySelectorAll('[aria-live]');
ok('hay exactamente una región viva', vivas.length === 1, `(${vivas.length})`);
ok('es polite, no assertive', vivas[0]?.getAttribute('aria-live') === 'polite');
ok('tiene role=status', vivas[0]?.getAttribute('role') === 'status');

console.log('\nTabla (WCAG 1.3.1)');
const tabla = raiz.querySelector('table');
ok('la tabla tiene <caption>', !!tabla?.querySelector('caption'));
const ths = [...(tabla?.querySelectorAll('thead th') ?? [])];
ok('todos los th tienen scope="col"', ths.length > 0 && ths.every((t) => t.getAttribute('scope') === 'col'),
   `(${ths.filter((t) => t.getAttribute('scope') === 'col').length}/${ths.length})`);
ok('ningún th queda sin nombre', ths.every((t) => t.textContent.trim().length > 0));

console.log('\nNombres accesibles (WCAG 4.1.2)');
const nombreDe = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
const botones = [...raiz.querySelectorAll('button')];
const glifos = botones.filter((b) => {
  const t = (b.textContent || '').trim();
  return t.length > 0 && t.length <= 2 && !/^[A-Za-z0-9]+$/.test(t);
});
const sinNombre = glifos.filter((b) => !b.getAttribute('aria-label'));
ok('los botones de un glifo tienen aria-label', sinNombre.length === 0,
   sinNombre.length ? '(' + sinNombre.map((b) => JSON.stringify(b.textContent.trim())).join(', ') + ')' : '');
const anonimos = botones.filter((b) => nombreDe(b).length === 0);
ok('ningún botón queda sin nombre accesible', anonimos.length === 0, `(${anonimos.length})`);

const docsBtn = botones.find((b) => b.className.includes('docs-btn'));
ok('el botón de documentos declara aria-expanded', !!docsBtn?.hasAttribute('aria-expanded'));

console.log('\nCeldas editables (WCAG 4.1.2 / 3.3.2)');
const celdas = [...raiz.querySelectorAll('[contenteditable="true"]')];
ok('hay celdas editables en el DOM', celdas.length > 0, `(${celdas.length})`);
ok('todas tienen aria-label', celdas.every((c) => !!c.getAttribute('aria-label')),
   `(${celdas.filter((c) => c.getAttribute('aria-label')).length}/${celdas.length})`);
ok('todas declaran role=textbox', celdas.every((c) => c.getAttribute('role') === 'textbox'));
ok('todas son alcanzables con el tabulador', celdas.every((c) => c.getAttribute('tabindex') === '0'));

console.log('\nJerarquía de encabezados');
const encabezados = [...raiz.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
ok('hay exactamente un h1', encabezados.filter((n) => n === 1).length === 1,
   `(${encabezados.filter((n) => n === 1).length})`);
let salta = null;
for (let i = 1; i < encabezados.length; i++) {
  if (encabezados[i] - encabezados[i - 1] > 1) { salta = `h${encabezados[i - 1]} -> h${encabezados[i]}`; break; }
}
ok('no se salta ningún nivel', salta === null, salta ?? '');

console.log('\nLa tabla conserva su semántica cuando el CSS la vuelve tarjeta');
// Bajo 860 px el CSS pone `display:block` en table/tbody/tr/td, y eso hace
// que el navegador DESCARTE los roles implícitos de tabla: el lector de
// pantalla deja de anunciar filas y columnas y lee una lista plana. Los
// roles explícitos son lo que devuelve la semántica, y son fáciles de
// perder al reescribir el marcado, así que se comprueban.
const laTabla = raiz.querySelector('table');
ok('la tabla declara role="table"', laTabla?.getAttribute('role') === 'table');
const trs = [...raiz.querySelectorAll('tbody tr')];
ok('todas las filas declaran role="row"',
   trs.length > 0 && trs.every((t) => t.getAttribute('role') === 'row'),
   `(${trs.filter((t) => t.getAttribute('role') === 'row').length} de ${trs.length})`);
const tds = [...raiz.querySelectorAll('tbody td')];
ok('todas las celdas declaran role="cell"',
   tds.length > 0 && tds.every((t) => t.getAttribute('role') === 'cell'),
   `(${tds.filter((t) => t.getAttribute('role') === 'cell').length} de ${tds.length})`);
ok('los encabezados declaran role="columnheader"',
   ths.length > 0 && ths.every((t) => t.getAttribute('role') === 'columnheader'),
   `(${ths.filter((t) => t.getAttribute('role') === 'columnheader').length} de ${ths.length})`);

console.log('\nDos trampas del CSS que ya costaron un incumplimiento');
// El compilador fusiona selectores, así que se comprueba la declaración.
const plano = css.replace(/\s+/g, '');
ok('los campos llegan a 16px en móvil, contra el zoom de iOS',
   /(input|select|textarea)[^{]*\{[^}]*font-size:16px/.test(plano),
   '(Safari amplía la página al enfocar un campo menor y no vuelve al salir)');
ok('.sin-dato no se diluye con opacidad',
   !/\.sin-dato\{[^}]*opacity/.test(plano),
   '(al 80% daba 3,34:1; a plena intensidad, 5,26:1)');

console.log('\nIdioma y errores de ejecución');
ok('el documento declara lang="es"', d.documentElement.lang === 'es');
ok('sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));

console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
