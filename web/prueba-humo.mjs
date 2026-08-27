// Prueba de humo: monta la aplicación real en un DOM simulado y comprueba
// que arranca, navega y renderiza contenido, sin errores de consola.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body><div id="raiz"></div><script>${readFileSync('dist-test/app.js', 'utf8')}<\/script></body></html>`;
const errores = [];

import { VirtualConsole } from 'jsdom';
const consola = new VirtualConsole();
consola.on('jsdomError', (e) => errores.push('jsdomError: ' + (e.stack || e.message)));
consola.on('error', (...m) => errores.push('error: ' + m.join(' ')));
consola.on('warn', () => {});

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: consola,
});

const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// jsdom no trae la API fetch completa; React Router la necesita al navegar
for (const g of ['Request', 'Response', 'Headers', 'fetch', 'AbortController', 'FormData']) {
  if (!window[g] && globalThis[g]) window[g] = globalThis[g];
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
await esperar(2500);

const texto = () => window.document.getElementById('raiz')?.textContent ?? '';

function comprobar(etiqueta, condicion) {
  console.log(`  ${condicion ? '✓' : '✗'} ${etiqueta}`);
  return condicion;
}

console.log('### Tablero: diseño aprobado');
comprobar('el contenedor tiene contenido', window.document.getElementById('raiz').children.length > 0);
comprobar('sin errores de JavaScript', errores.length === 0);
if (errores.length) errores.slice(0, 4).forEach((e) => console.log('     ' + e.slice(0, 130)));

console.log('\n### Tablero');
comprobar('título aprobado', texto().includes('Iniciativas Legislativas por Dirección'));
comprobar('fila de clasificación', texto().includes('Uso interno') && texto().includes('Dirigido a'));
comprobar('aviso de tablero compartido', texto().includes('Tablero compartido'));
comprobar('secciones numeradas', texto().includes('Resumen general') && texto().includes('Iniciativas por dirección'));
comprobar('encabezados de la tabla', texto().includes('Objeto / alcance') && texto().includes('No. proyecto'));
comprobar('pie institucional', texto().includes('no constituye registro oficial'));
comprobar('carga las direcciones', texto().includes('Derechos Humanos'));
comprobar('estado del catálogo visible', /Radicado|En formulación/.test(texto()));
comprobar('lista iniciativas', texto().includes('participación ciudadana territorial'));
comprobar('marca las propuestas', texto().includes('propuesta'));

console.log('\n### Detalle e historial');
const filas = [...window.document.querySelectorAll('button.estado-btn')];
comprobar('la píldora de estado es pulsable', filas.length > 0);
filas[0]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await esperar(1200);
comprobar('abre el panel de detalle', !!window.document.querySelector('[role="dialog"]'));
comprobar('muestra acciones del flujo', texto().includes('Acciones disponibles'));
comprobar('muestra el historial', texto().includes('Historial'));
comprobar('muestra el recorrido del trámite', texto().includes('Recorrido del trámite'));

console.log('\n### Navegación');
// La administración ya no está en la misma estructura: se entra por la franja
const aAdmin = [...window.document.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Administración');
comprobar('hay acceso a administración', !!aAdmin);
aAdmin?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
await esperar(1000);

for (const [ruta, esperado] of [
  ['Roles y permisos', 'Los permisos los define el sistema'],
  ['Flujo de estados', 'El flujo configurado'],
  ['Usuarios', 'esperan aprobación'],
  ['Estadísticas', 'El paso más lento del trámite'],
]) {
  const enlace = [...window.document.querySelectorAll('a')].find((a) => a.textContent?.trim() === ruta);
  if (!enlace) { console.log(`  ✗ no encuentro el enlace "${ruta}"`); continue; }
  enlace.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
  await esperar(900);
  comprobar(`${ruta} → renderiza`, texto().includes(esperado));
}

console.log('\n### Alertas del flujo');
// Hay que volver a la pantalla de flujo: la comprobación anterior nos dejó en Estadísticas
const aFlujo = [...window.document.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Flujo de estados');
aFlujo?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, button: 0 }));
await esperar(900);
comprobar('avisa del estado sin responsables', /no tienen? responsables activos/.test(texto()));
comprobar('nombra el estado afectado', texto().includes('En comisión'));

console.log('\nerrores acumulados:', errores.length);
process.exit(0);
