// Las cinco tarjetas del resumen, como filtros.
//
// La pregunta que motiva todo esto es «¿qué tengo en comisión con prioridad
// alta?»: la consulta diaria de un funcionario, que antes no tenía respuesta
// en ninguna parte de la pantalla.
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

async function montar(url) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url, virtualConsole: vc,
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const g of ['Request', 'Response', 'Headers', 'fetch', 'AbortController', 'FormData']) {
    if (!w[g] && globalThis[g]) w[g] = globalThis[g];
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { w, raiz: w.document.getElementById('raiz') };
}

// Esperar un tiempo fijo hacía que esta prueba dependiera de lo rápido que
// jsdom evalúe el paquete: con dos DOM montados en el mismo proceso, 300 ms
// dejaban de alcanzar y el filtro anterior seguía puesto, así que la
// siguiente tarjeta medía dos filtros a la vez. El síntoma era «dice 5,
// muestra 1» —un fallo que parece del producto y es de la prueba—.
//
// Se espera la condición y se agota a los 4 s. Si nunca se cumple, la
// prueba falla igual: esto no relaja la comprobación, la vuelve estable.
async function hasta(condicion, limite = 4000) {
  const fin = Date.now() + limite;
  while (Date.now() < fin) {
    if (condicion()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

const filas = (raiz) => [...raiz.querySelectorAll('tbody tr:not(.docs-row)')];
const tarjetas = (raiz) => [...raiz.querySelectorAll('.stat')];
const rotulo = (f) => (f.querySelector('.l')?.textContent || '').trim();
const cifra = (f) => Number(f.querySelector('.n')?.textContent || 0);

console.log('\nLas tarjetas son controles, no adorno');
const a = await montar('http://localhost/');
const t = tarjetas(a.raiz);
ok('hay cinco tarjetas', t.length === 5, `(${t.length})`);
ok('todas son <button>', t.every((x) => x.tagName === 'BUTTON'));
ok('todas declaran aria-pressed', t.every((x) => x.hasAttribute('aria-pressed')));
ok('conservan la clase .stat del diseño aprobado', t.every((x) => x.className.includes('stat')));
ok('sin filtros, la de «totales» está activa',
   t[0].getAttribute('aria-pressed') === 'true' && rotulo(t[0]) === 'Iniciativas totales');
ok('las otras cuatro no', t.slice(1).every((x) => x.getAttribute('aria-pressed') === 'false'));

const totalFilas = filas(a.raiz).length;
ok('la cifra de «totales» coincide con las filas', cifra(t[0]) === totalFilas,
   `(${cifra(t[0])} vs ${totalFilas})`);
a.w.close();

console.log('\nCada cifra corresponde a lo que se obtiene al pulsarla');
const b = await montar('http://localhost/');
const totalB = filas(b.raiz).length;
for (const rot of ['Radicadas', 'En comisión', 'Aprobadas', 'Prioridad alta']) {
  const card = tarjetas(b.raiz).find((x) => rotulo(x) === rot);
  const esperado = cifra(card);
  card.dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
  const aplicado = await hasta(() =>
    tarjetas(b.raiz).find((x) => rotulo(x) === rot)?.getAttribute('aria-pressed') === 'true');
  const obtenido = filas(b.raiz).length;
  ok(`«${rot}»: dice ${esperado}, muestra ${obtenido}`, aplicado && esperado === obtenido);

  // Soltar el filtro, y NO seguir hasta comprobar que quedó suelto: si se
  // arrastra, la tarjeta siguiente mide dos filtros y el fallo aparece
  // donde no está la causa.
  tarjetas(b.raiz).find((x) => rotulo(x) === rot)
    .dispatchEvent(new b.w.MouseEvent('click', { bubbles: true }));
  const suelto = await hasta(() => filas(b.raiz).length === totalB);
  ok(`  y al soltarlo vuelven las ${totalB} filas`, suelto, `(${filas(b.raiz).length})`);
}
b.w.close();

console.log('\nLa pregunta del día: en comisión Y prioridad alta');
const c = await montar('http://localhost/?estado=comision&prioridad=Alta');
const tc = tarjetas(c.raiz);
const comision = tc.find((x) => rotulo(x) === 'En comisión');
const alta = tc.find((x) => rotulo(x) === 'Prioridad alta');
ok('los dos filtros quedan activos a la vez',
   comision.getAttribute('aria-pressed') === 'true' && alta.getAttribute('aria-pressed') === 'true');
ok('«totales» deja de estar activa', tc[0].getAttribute('aria-pressed') === 'false');

// Toda fila visible cumple LAS DOS condiciones.
const visibles = filas(c.raiz);
const cumplen = visibles.filter((f) => {
  const est = (f.querySelector('.estado-btn')?.textContent || '').trim().toLowerCase();
  const prio = f.querySelector('.prior-lbl, .prior-sel');
  const leido = prio && prio.tagName === 'SELECT' ? prio.value : (prio?.textContent ?? '');
  return est.includes('comisi') && leido.trim() === 'Alta';
});
ok('toda fila mostrada cumple las dos condiciones',
   visibles.length > 0 && cumplen.length === visibles.length,
   `(${cumplen.length} de ${visibles.length})`);

console.log('\nHay salida del filtro');
const salida = c.raiz.querySelector('.quitar-filtros');
ok('aparece el botón de quitar', !!salida);
ok('y dice qué está filtrado', /comisi/i.test(salida?.textContent ?? '') && /alta/i.test(salida?.textContent ?? ''),
   `("${salida?.textContent.trim().replace(/\s+/g, ' ')}")`);
salida.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true }));
const limpio = await hasta(() => filas(c.raiz).length === totalFilas);
ok('al quitarlo vuelven todas las filas', limpio,
   `(${filas(c.raiz).length} de ${totalFilas})`);
c.w.close();

console.log('\nEl filtro viaja en la URL y el resumen dice su alcance');
const d = await montar('http://localhost/?direccion=ddhh');
const et = d.raiz.querySelector('.alcance-resumen')?.textContent.trim();
ok('el rótulo nombra la dirección, no «todas»', !!et && !/todas/i.test(et), `("${et}")`);
// La cifra de «totales» tiene que ser la de ESA dirección, no la global.
const tot = cifra(tarjetas(d.raiz)[0]);
ok('«totales» cuenta solo esa dirección', tot === filas(d.raiz).length && tot < totalFilas,
   `(${tot} de ${totalFilas} globales)`);
d.w.close();

console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
