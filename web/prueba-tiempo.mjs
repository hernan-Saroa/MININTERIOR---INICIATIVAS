// El tiempo y la jerarquía de la fila, sobre el DOM renderizado.
//
// Un rastreador de trámites tiene que decir cuánto lleva parado cada uno. La
// pantalla mostraba una fecha cruda y nada más, y había que restar
// mentalmente dieciséis veces para saber dónde mirar.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const app = readFileSync('dist-test/app.js', 'utf8');
const css = readFileSync('dist-test/iniciativas-web.css', 'utf8');
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">`
  + `<style>${css}</style></head><body><div id="raiz"></div><script>${app}<\/script></body></html>`;

let fallos = 0;
const ok = (n, c, extra) => {
  console.log((c ? '  OK    ' : '  FALLA ') + n + (extra ? '  ' + extra : ''));
  if (!c) fallos++;
};

const vc = new VirtualConsole();
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
const raiz = w.document.getElementById('raiz');

console.log('\nEl tiempo aparece en cada fila');
const filas = [...raiz.querySelectorAll('tbody tr:not(.docs-row)')];
ok('hay filas que mirar', filas.length > 0, `(${filas.length})`);
const conTiempo = filas.filter((f) => f.querySelector('.tiempo-estado'));
ok('todas las filas dicen cuánto llevan', conTiempo.length === filas.length,
   `(${conTiempo.length} de ${filas.length})`);

const textos = conTiempo.map((f) => f.querySelector('.tiempo-estado').textContent.trim());
ok('el tiempo está en palabras, no en fecha cruda',
   textos.every((t) => !/^\d{4}-\d{2}-\d{2}$/.test(t)),
   `(ej. "${textos[0]}")`);
ok('las cifras se alinean (tabular-nums en el CSS)',
   css.includes('tabular-nums') || css.includes('font-variant-numeric'));

console.log('\nLa jerarquía: no todas las filas pesan igual');
const marcadas = filas.filter((f) => f.className.includes('fila-atencion'));
ok('algunas filas están marcadas y otras no',
   marcadas.length > 0 && marcadas.length < filas.length,
   `(${marcadas.length} de ${filas.length})`);

// La marca no puede ser solo color: la fila marcada tiene que llevar además
// una razón legible —prioridad Alta, o un tiempo en atención—.
const sinRazon = marcadas.filter((f) => {
  const prio = f.querySelector('.prior-lbl, .prior-sel');
  // Ojo: en un <select> el textContent son TODAS las opciones juntas
  // («AltaMediaBaja»), así que hay que leer el valor seleccionado.
  const leido = prio && prio.tagName === 'SELECT' ? prio.value : (prio?.textContent ?? '');
  const alta = leido.trim().toLowerCase() === 'alta';
  const atencion = !!f.querySelector('.tiempo-estado.atencion');
  return !alta && !atencion;
});
ok('toda fila marcada dice POR QUÉ lo está', sinRazon.length === 0,
   sinRazon.length ? `(${sinRazon.length} sin razón visible)` : '(prioridad alta o tiempo excedido)');

console.log('\nLa franja no descoloca la tabla');
// El compilador fusiona selectores, así que se comprueba la declaración y no
// la forma exacta de la regla.
const plano = css.replace(/\s+/g, '');
ok('se pinta con box-shadow interior, no con borde',
   /tr\.fila-atencion[^{]*\{[^}]*box-shadow:inset/.test(plano),
   '(un borde real desplazaría las ocho celdas)');
ok('en móvil sí usa borde, donde la fila es una tarjeta',
   /tr\.fila-atencion\{box-shadow:none;border-left/.test(plano));

console.log('\nEl aviso agregado, si hay algo detenido');
const aviso = raiz.querySelector('.aviso-estancados');
if (aviso) {
  ok('el aviso dice cuántos y desde cuándo',
     /llevan?\s/.test(aviso.textContent) && /d[íi]as sin moverse/.test(aviso.textContent),
     `("${aviso.textContent.trim().replace(/\s+/g, ' ').slice(0, 58)}…")`);
  ok('se anuncia a lectores de pantalla', aviso.getAttribute('role') === 'status');
} else {
  ok('sin trámites detenidos, no hay aviso vacío', true, '(nada que avisar)');
}

console.log('\nSin emoji como iconografía');
const cuerpo = raiz.textContent;
ok('el clip ya no es un emoji', !cuerpo.includes('\u{1F587}'),
   '(caía a un glifo que se leía como «$» en Windows)');
ok('el chevron tampoco', !cuerpo.includes('›'));
ok('hay iconos vectoriales en su lugar', raiz.querySelectorAll('svg').length > 0,
   `(${raiz.querySelectorAll('svg').length} svg)`);

w.close();
console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
