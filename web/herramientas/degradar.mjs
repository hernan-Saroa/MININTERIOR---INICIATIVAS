// Solo para revisión visual: convierte el CSS moderno de Tailwind 4 a una
// sintaxis que el motor de captura antiguo pueda interpretar.
import { transform, browserslistToTargets } from 'lightningcss';
import browserslist from 'browserslist';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const css = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const { code } = transform({
  filename: 'x.css', code: Buffer.from(css), minify: false,
  targets: browserslistToTargets(browserslist('safari >= 9, chrome >= 40')),
});

function desenvolver(t) {
  let out = '', i = 0;
  while (i < t.length) {
    const m = /@layer[^{;]*\{/.exec(t.slice(i));
    if (!m) { out += t.slice(i); break; }
    const ini = i + m.index;
    out += t.slice(i, ini);
    let j = ini + m[0].length, n = 1;
    while (j < t.length && n > 0) { if (t[j] === '{') n++; else if (t[j] === '}') n--; j++; }
    out += desenvolver(t.slice(ini + m[0].length, j - 1));
    i = j;
  }
  return out;
}

const plano = desenvolver(code.toString()).replace(/@property[^{]*\{[^}]*\}/g, '');
for (const f of readdirSync('/tmp').filter((n) => n.startsWith('ssr-') && n.endsWith('.html'))) {
  const h = readFileSync('/tmp/' + f, 'utf8');
  writeFileSync('/tmp/vis-' + f, h.replace(/<style>[\s\S]*?<\/style>/, '<style>' + plano + '</style>'));
}
console.log('CSS plano:', plano.length, 'bytes');
