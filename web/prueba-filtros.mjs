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

// Lo que se comprueba aquí es lo mismo de siempre —hay salida, y la
// pantalla dice qué está aplicado— pero contra el panel de consulta, que es
// donde vive ahora. Antes era un solo botón cuyo rótulo enumeraba los
// filtros; ahora cada filtro es una ficha que se quita sola, así que además
// se comprueba que quitar UNA deje la otra en pie: eso es lo que el botón
// único no podía hacer.
console.log('\nHay salida del filtro, y dice cuál');
const fichas = () => [...c.raiz.querySelectorAll('.chip-filtro')];
const textoFichas = () => fichas().map((f) => f.textContent).join(' | ');
ok('cada filtro aplicado tiene su ficha', fichas().length === 2, `(${fichas().length})`);
ok('y las fichas dicen qué está filtrado',
   /comisi/i.test(textoFichas()) && /alta/i.test(textoFichas()),
   `("${textoFichas().replace(/\s+/g, ' ')}")`);

// Quitar una sola: se va la de estado y sobrevive la de prioridad.
const fichaEstado = fichas().find((f) => /comisi/i.test(f.textContent));
fichaEstado.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true }));
const soloPrioridad = await hasta(() => fichas().length === 1);
ok('quitar una ficha no se lleva la otra',
   soloPrioridad && /alta/i.test(textoFichas()),
   `("${textoFichas().replace(/\s+/g, ' ')}")`);

// Y volver a ponerla para probar la salida completa.
tarjetas(c.raiz).find((x) => rotulo(x) === 'En comisión')
  .dispatchEvent(new c.w.MouseEvent('click', { bubbles: true }));
await hasta(() => fichas().length === 2);

const salida = c.raiz.querySelector('.quitar-filtros');
ok('con dos filtros aparece «Quitar todos»', !!salida,
   `("${salida?.textContent.trim()}")`);
salida.dispatchEvent(new c.w.MouseEvent('click', { bubbles: true }));
const limpio = await hasta(() => filas(c.raiz).length === totalFilas);
ok('al quitarlos vuelven todas las filas', limpio,
   `(${filas(c.raiz).length} de ${totalFilas})`);
ok('y no queda ninguna ficha', fichas().length === 0, `(${fichas().length})`);
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

// =====================================================================
// El teclado en el panel de consulta.
//
// Nada de esto se ve leyendo el JSX: hay que montar la página, pulsar y
// mirar dónde quedó el foco. Son las tres cosas que un teclado espera de
// un buscador y de un grupo de opciones excluyentes.
// =====================================================================
console.log('\nEl panel de consulta se maneja con el teclado');
const k = await montar('http://localhost/');
const tecla = (destino, key) => destino.dispatchEvent(
  new k.w.KeyboardEvent('keydown', { key, bubbles: true }));
const campo = k.raiz.querySelector('#consulta-tramite');
const pildoras = () => [...k.raiz.querySelectorAll('.tab')];

tecla(k.w.document.body, '/');
ok('«/» lleva el foco al buscador', k.w.document.activeElement === campo,
   `(${k.w.document.activeElement?.id || k.w.document.activeElement?.tagName})`);

// Y no se lo lleva mientras se escribe: en una celda editable la barra es
// un carácter, no un atajo.
const celda = k.raiz.querySelector('[contenteditable="true"]');
celda.focus();
tecla(celda, '/');
ok('pero no interrumpe la escritura en una celda', k.w.document.activeElement === celda);

console.log('\nEl riel de direcciones es un grupo de opciones excluyentes');
const grupo = k.raiz.querySelector('.tabs');
ok('declara role=radiogroup', grupo?.getAttribute('role') === 'radiogroup');
ok('cada píldora es una opción',
   pildoras().length > 1 && pildoras().every((p) => p.getAttribute('role') === 'radio'),
   `(${pildoras().length})`);
ok('solo la marcada declara aria-checked',
   pildoras().filter((p) => p.getAttribute('aria-checked') === 'true').length === 1);
// Tabulador itinerante: una sola parada en el riel, y dentro se anda con
// las flechas. Antes había que tabular por las siete direcciones.
ok('solo la marcada entra en el tabulador',
   pildoras().filter((p) => p.getAttribute('tabindex') === '0').length === 1);

const antes = pildoras().findIndex((p) => p.className.includes('active'));
pildoras()[antes].focus();
tecla(pildoras()[antes], 'ArrowRight');
const movio = await hasta(() => pildoras().findIndex((p) => p.className.includes('active')) === antes + 1);
ok('la flecha derecha pasa a la siguiente', movio,
   `(de ${antes} a ${pildoras().findIndex((p) => p.className.includes('active'))})`);
ok('y el foco viaja con ella',
   k.w.document.activeElement === pildoras()[antes + 1]);

tecla(k.w.document.activeElement, 'End');
const alFinal = await hasta(() =>
  pildoras()[pildoras().length - 1].className.includes('active'));
ok('«Fin» salta a la última', alFinal);
k.w.close();

console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
