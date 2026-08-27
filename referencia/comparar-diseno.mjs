// Informa de las diferencias entre el tablero y referencia/tablero-aprobado.html,
// mirando SOLO las reglas de base: mezclar overrides de @media da diferencias
// falsas, porque son sobrescrituras y no decisiones distintas.
//
//   node referencia/comparar-diseno.mjs
//
// **Solo informa. Sale con codigo 0 siempre.** Antes salia con 1 al detectar
// cualquier diferencia, porque el diseno estaba bloqueado y divergir era un
// defecto. Ya no lo es: el objetivo es mejorar el proyecto, y una comprobacion
// que falla al mejorar la interfaz trabaja en contra.
//
// Lo que SI falla es el contraste, que es una obligacion legal y no una
// preferencia:  node scripts/verificar-contraste.js
//
// La lista CASOS son las propiedades que ya se movieron alguna vez. Si mas
// adelante se cambia otra cosa, se amplia aqui para poder verla.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const R = fileURLToPath(new URL('../', import.meta.url));
const port = readFileSync(R + 'web/src/tablero-aprobado.css', 'utf8')
  .split('\n').slice(0, 195).join('\n');
const refHtml = readFileSync(R + 'referencia/tablero-aprobado.html', 'utf8');
const refCss = [...refHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

const soloBase = (css) => css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\}/g, '');
const bp = soloBase(port);
const br = soloBase(refCss);

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function valor(css, sel, prop) {
  const re = new RegExp(escapar(sel) + '\\s*\\{([^}]*)\\}');
  const m = re.exec(css);
  if (!m) return null;
  const p = new RegExp('(?:^|;)\\s*' + escapar(prop) + '\\s*:\\s*([^;]+)').exec(m[1]);
  return p ? p[1].trim().replace(/\s+/g, ' ') : null;
}

const CASOS = [
  ['body', 'font-family'],
  [':root', '--radius'],
  ['.sub', 'font-size'],
  ['.sub', 'line-height'],
  ['.meta-item .l', 'font-size'],
  ['.meta-item .l', 'letter-spacing'],
  ['.stat .l', 'font-size'],
  ['.stat .l', 'font-weight'],
  ['.stat .l', 'letter-spacing'],
  ['.tab', 'padding'],
  ['.tab:hover', 'box-shadow'],
  ['.tab.active', 'box-shadow'],
  ['.add-btn:hover', 'background'],
  ['thead th', 'font-size'],
  ['thead th', 'letter-spacing'],
  ['tbody td', 'padding'],
  ['tbody tr:hover', 'background'],
  ['.docs-btn:hover', 'box-shadow'],
  ['.docs-btn.open', 'box-shadow'],
  ['.export-btn', 'padding'],
  ['.export-btn:hover', 'background'],
  ['footer', 'margin-top'],
];

console.log('  ' + 'selector · propiedad'.padEnd(34) + 'referencia'.padEnd(26) + 'portado');
console.log('  ' + '-'.repeat(92));
const divergen = [];
for (const [sel, prop] of CASOS) {
  const a = valor(br, sel, prop);
  const b = valor(bp, sel, prop);
  if (a !== b) {
    divergen.push([sel, prop, a, b]);
    console.log('  ' + `${sel} · ${prop}`.padEnd(34)
      + String(a).slice(0, 24).padEnd(26) + String(b).slice(0, 34));
  }
}
console.log('');
console.log('  divergencias de diseño:', divergen.length, 'de', CASOS.length, 'comprobadas');
console.log('  tokens nuevos en el portado:',
  ['--sombra-sutil', '--sombra-media', '--sombra-elevada', '--transicion']
    .filter((t) => bp.includes(t)).join(', ') || 'ninguno');
console.log('  reglas con sombra de token:', (bp.match(/box-shadow:\s*var\(--sombra/g) || []).length);
console.log('  .stat::after (brillo nuevo):', bp.includes('.stat::after'));
console.log('  .stat:hover:', bp.includes('.stat:hover'));

// Deliberadamente sin process.exit(1): esto informa, no prohibe.
if (divergen.length) {
  console.log('');
  console.log('  Las diferencias de arriba NO son un defecto. Si el cambio es');
  console.log('  intencionado, conviene reflejarlo en la referencia para que');
  console.log('  siga sirviendo de punto de comparacion.');
}
