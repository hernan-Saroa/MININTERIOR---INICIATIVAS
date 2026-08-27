// ---------------------------------------------------------------------
// Contraste de color según WCAG 2.1, sobre las hojas de estilo reales.
//
//   node scripts/verificar-contraste.js
//
// Por qué existe: la Resolución 1519 de 2020 del MinTIC exige WCAG 2.1
// nivel AA a las entidades del Estado colombiano. AA pide 4,5:1 para
// texto normal y 3:1 para texto grande (18,66px en negrita, o 24px) y
// para los componentes de interfaz.
//
// Esto se comprobaba a mano y quedaba anotado en un documento, así que
// envejecía sin que nadie lo notara. Ahora es una comprobación que falla.
//
// Sale con código 1 si algún par incumple.
// ---------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(RAIZ, 'web/src/tablero-aprobado.css'), 'utf8');
const estilos = fs.readFileSync(path.join(RAIZ, 'web/src/estilos.css'), 'utf8');

// --- Color ------------------------------------------------------------

function aRgb(color) {
  const c = color.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(c);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
  m = /^#([0-9a-f]{6})$/.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2]];
  }
  throw new Error('color no reconocido: ' + color);
}

// Composición sobre un fondo, para los colores con alfa. Un texto al 80 %
// de opacidad NO tiene el contraste de su color: tiene el del resultado.
function componer(rgba, fondo) {
  const m = /^rgba\(([^)]+)\)$/.exec(rgba.trim().toLowerCase());
  if (!m) return aRgb(rgba);
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const a = p[3] === undefined ? 1 : p[3];
  const f = aRgb(fondo);
  return [0, 1, 2].map((i) => Math.round(p[i] * a + f[i] * (1 - a)));
}

const canal = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminancia = ([r, g, b]) =>
  0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

function ratio(frente, fondo) {
  const a = luminancia(componer(frente, fondo));
  const b = luminancia(aRgb(fondo));
  const [claro, oscuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (oscuro + 0.05);
}

// --- Tokens -----------------------------------------------------------

function tokens(cuerpo) {
  const mapa = {};
  if (!cuerpo) return mapa;
  for (const m of cuerpo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const valor = m[2].trim();
    if (/^(#|rgb)/i.test(valor)) mapa[m[1]] = valor;
  }
  return mapa;
}

// El tablero declara su paleta en :root. /admin la declara en el bloque
// @theme de Tailwind 4, con el prefijo --color-. Se normalizan a un solo
// mapa para poder cruzar las dos hojas.
const raiz = /:root\s*\{([\s\S]*?)\n\s*\}/.exec(css);
const tema = /@theme\s*\{([\s\S]*?)\n\}/.exec(estilos);

const admin = {};
for (const [k, valor] of Object.entries(tokens(tema && tema[1]))) {
  admin[k.replace(/^--color-/, '--')] = valor;
}
const T = { ...admin, ...tokens(raiz && raiz[1]) };
const v = (nombre) => {
  if (!T[nombre]) throw new Error('token sin definir: ' + nombre);
  return T[nombre];
};

// --- Los pares que hay que cumplir ------------------------------------
//
// `grande: true` marca el texto que WCAG considera grande (>=18,66px en
// negrita o >=24px), donde el mínimo baja a 3:1. Las píldoras de estado
// son de 11px en negrita: NO son texto grande, por mucho que se repita.

const PARES = [
  // Tablero: texto sobre fondos planos
  ['cuerpo sobre el fondo', '--text', '--bg'],
  ['cuerpo sobre panel', '--text', '--panel'],
  ['texto tenue sobre panel', '--muted', '--panel'],
  ['texto tenue sobre panel-2', '--muted', '--panel-2'],
  ['encabezado de tabla', '--muted', '--panel-2'],
  ['cifra de la tarjeta', '--blue', '--panel'],

  // Píldoras de estado: 11px en negrita, texto normal para WCAG
  ['píldora Radicado (azul)', '--blue', '--blue-tint'],
  ['píldora En comisión (ámbar)', '--amber', '--amber-tint'],
  ['píldora Aprobado (verde)', '--green', '--green-tint'],
  ['píldora Archivado (rojo)', '--red', '--red-tint'],
  ['píldora En formulación', '--muted', '--panel-2'],

  // Prioridad
  ['prioridad Alta', '--red', '--red-tint'],
  ['prioridad Media', '--amber', '--amber-tint'],
  ['prioridad Baja', '--muted', '--panel-2'],

  // Avisos
  ['aviso .notice', '--muted', '--blue-tint'],
  ['aviso .notice en negrita', '--text', '--blue-tint'],
  ['aviso de provisional (ámbar)', '--muted', '--amber-tint'],

  // Franja navy
  ['epígrafe sobre navy', '#c7d2ea', '--navy'],
  ['blanco sobre navy', '#ffffff', '--navy'],
  ['pestaña activa', '#ffffff', '--navy'],

  // Botones
  ['botón azul en reposo', '--blue', '--panel'],
  ['botón azul al pasar', '#ffffff', '--blue'],

  // /admin usa estilos.css
  ['admin: texto sobre panel', '--tinta', '--panel'],
  ['admin: tenue sobre panel', '--tenue', '--panel'],
  ['admin: acción sobre panel', '--accion', '--panel'],

  // Panel de consulta (buscar + dirección + filtros activos). Las fichas
  // de filtro son de 12px: texto normal para WCAG, no texto grande.
  ['ficha de filtro', '--blue', '--blue-tint'],
  ['resultado en cero (ámbar)', '--amber', '--panel'],

  // El contador de cada dirección es un dato —cuántas iniciativas hay ahí—,
  // no un adorno, y va sobre su propia insignia. Los dos fondos son literales
  // en `.tab .count`: si se retocan, este par avisa antes que el usuario.
  ['contador de dirección', '--muted', '#f1f4f9'],
  ['contador al pasar el cursor', '--blue', '#e6edf8'],
];

// El mapa TONOS de web/src/ui/base.tsx: el único sitio donde /admin
// resuelve el color de un estado. Ninguna auditoría lo había mirado.
const base = fs.readFileSync(path.join(RAIZ, 'web/src/ui/base.tsx'), 'utf8');
const bloqueTonos = /const TONOS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(base);

// --- Ejecución --------------------------------------------------------

let fallos = 0;
const MINIMO = 4.5;
const MINIMO_GRANDE = 3;

console.log('\nWCAG 2.1 AA — 4,5:1 para texto normal, 3:1 para texto grande');
console.log('(Resolución 1519 de 2020 del MinTIC)\n');

function comprobar(nombre, frenteTok, fondoTok, grande = false) {
  const frente = frenteTok.startsWith('--') ? v(frenteTok) : frenteTok;
  const fondo = fondoTok.startsWith('--') ? v(fondoTok) : fondoTok;
  const r = ratio(frente, fondo);
  const minimo = grande ? MINIMO_GRANDE : MINIMO;
  const pasa = r >= minimo;
  if (!pasa) fallos++;
  console.log('  ' + (pasa ? 'OK    ' : 'FALLA ')
    + nombre.padEnd(34)
    + r.toFixed(2).padStart(5) + ':1'
    + '  (mínimo ' + minimo + ')'
    + (pasa ? '' : '   ' + frente + ' sobre ' + fondo));
  return r;
}

for (const [nombre, frente, fondo, grande] of PARES) {
  comprobar(nombre, frente, fondo, grande);
}

if (bloqueTonos) {
  console.log('\n  El mapa TONOS de /admin (ui/base.tsx)');
  // Cada entrada es  clave: 'text-[#xxxxxx] bg-[#yyyyyy] ...'
  // Cada entrada nombra clases de Tailwind —texto: 'text-verde',
  // fondo: 'bg-verde-tenue'— que hay que resolver contra @theme.
  let vistos = 0;
  for (const m of bloqueTonos[1].matchAll(/(\w+)\s*:\s*\{([^}]+)\}/g)) {
    const txt = /texto:\s*'text-([a-z0-9-]+)'/.exec(m[2]);
    const bg = /fondo:\s*'bg-([a-z0-9-]+)'/.exec(m[2]);
    if (!txt || !bg) continue;
    const frente = T['--' + txt[1]];
    const fondo = T['--' + bg[1]];
    if (!frente || !fondo) {
      console.log('  AVISO  ' + ('píldora ' + m[1]).padEnd(34)
        + 'sin resolver: ' + txt[1] + ' / ' + bg[1]);
      fallos++;
      continue;
    }
    comprobar('píldora ' + m[1] + ' (/admin)', frente, fondo);
    vistos++;
  }
  if (!vistos) {
    console.log('  (no se resolvió ninguna píldora: revise el formato de TONOS)');
    fallos++;
  }
} else {
  console.log('\n  (no se pudo leer el mapa TONOS de ui/base.tsx)');
  fallos++;
}

console.log('\nfallos: ' + fallos);
process.exit(fallos ? 1 : 0);
