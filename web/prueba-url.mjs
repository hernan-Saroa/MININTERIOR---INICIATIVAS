// La pestaña y la consulta viven en la URL, no en el estado del componente.
//
// Antes no se podía compartir un enlace a una iniciativa ni guardar en
// favoritos la consulta de un código, y el botón «atrás» del navegador —el
// gesto más usado por quien tiene poca práctica— sacaba del sitio en vez de
// deshacer el filtro.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const app = readFileSync('dist-test/app.js', 'utf8');
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>`
  + `<body><div id="raiz"></div><script>${app}<\/script></body></html>`;

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

const filasDe = (raiz) => raiz.querySelectorAll('tbody tr:not(.docs-row)').length;

// Cuántas filas hay sin filtrar, para poder comparar.
const base = await montar('http://localhost/');
const total = filasDe(base.raiz);
console.log('\nSin parámetros: el comportamiento de siempre');
const act = [...base.raiz.querySelectorAll('.tab')].find((t) => t.className.includes('active'));
ok('arranca en «Todas»', !!act && act.textContent.trim().startsWith('Todas'));
ok('el buscador arranca vacío', base.raiz.querySelector('#consulta-tramite')?.value === '');
ok('hay filas que mostrar', total > 0, `(${total})`);
base.w.close();

console.log('\nLa consulta llega en la URL y se aplica');
// Un término que sí existe en los datos de prueba.
const a = await montar('http://localhost/?q=ley');
ok('el buscador arranca con la consulta de la URL',
   a.raiz.querySelector('#consulta-tramite')?.value === 'ley');
const conFiltro = filasDe(a.raiz);
ok('la tabla queda filtrada', conFiltro > 0 && conFiltro < total, `(${conFiltro} de ${total})`);
a.w.close();

console.log('\nUn código que no existe: cero filas Y el mensaje que lo explica');
const z = await montar('http://localhost/?q=INI-2026-9999');
ok('sin coincidencias no hay filas', filasDe(z.raiz) === 0);
const aviso = z.raiz.querySelector('.empty')?.textContent ?? '';
ok('sale el mensaje, no un hueco blanco', /Ninguna iniciativa coincide/.test(aviso),
   `("${aviso.trim().slice(0, 44)}…")`);
z.w.close();

console.log('\nLa pestaña llega en la URL');
const b = await montar('http://localhost/?direccion=ddhh');
const activa = [...b.raiz.querySelectorAll('.tab')].find((t) => t.className.includes('active'));
ok('la pestaña activa es la de la URL',
   !!activa && !activa.textContent.trim().startsWith('Todas'),
   `("${activa?.textContent.trim()}")`);
ok('y la tabla muestra solo esa dirección', filasDe(b.raiz) < total, `(${filasDe(b.raiz)} de ${total})`);
b.w.close();

console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
