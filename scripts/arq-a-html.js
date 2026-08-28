/**
 * Convierte ARQUITECTURA_TECNICA.md en un HTML autocontenido con las imágenes
 * incrustadas como data-URI (base64). El archivo resultante se puede abrir
 * en cualquier navegador y guardar como PDF con Ctrl+P.
 *
 * Uso: node scripts/manual-a-html.js
 * Salida: docs/ARQUITECTURA_TECNICA.html
 */

const fs = require('fs');
const path = require('path');

const carpetaDocs = path.join(__dirname, '..', 'docs');
const archivoMd = path.join(carpetaDocs, 'ARQUITECTURA_TECNICA.md');
const archivoHtml = path.join(carpetaDocs, 'ARQUITECTURA_TECNICA.html');

let md = fs.readFileSync(archivoMd, 'utf8');

// ── 1. Incrustar imágenes como data-URI ─────────────────────────────
md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, ruta) => {
  const absoluta = path.resolve(carpetaDocs, ruta);
  if (!fs.existsSync(absoluta)) {
    console.warn(`⚠ Imagen no encontrada: ${absoluta}`);
    return `![${alt}](${ruta})`;
  }
  const ext = path.extname(ruta).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
    : ext === 'gif' ? 'image/gif'
    : ext === 'webp' ? 'image/webp'
    : 'application/octet-stream';
  const base64 = fs.readFileSync(absoluta).toString('base64');
  console.log(`  ✓ Incrustada: ${ruta} (${(base64.length * 0.75 / 1024).toFixed(0)} KB)`);
  return `![${alt}](data:${mime};base64,${base64})`;
});

// ── 2. Convertir Markdown a HTML (simple, sin dependencias) ─────────
function mdAHtml(texto) {
  let html = texto;

  // Bloques de código con mermaid → dejar como texto preformateado
  html = html.replace(/```mermaid\n([\s\S]*?)```/g, (_m, code) =>
    `<pre class="mermaid">${code.trim()}</pre>`
  );

  // Bloques de código genéricos
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
    `<pre><code class="language-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
  );

  // Código inline
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Imágenes (ya son data-URI)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
    '<figure><img src="$2" alt="$1" /><figcaption>$1</figcaption></figure>');

  // Enlaces
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Negritas e itálicas
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br/>');

  // Tablas
  html = html.replace(/((?:^\|.+\|\r?\n)+)/gm, (bloque) => {
    const filas = bloque.trim().split('\n').filter(f => !/^\|[\s-:|]+\|$/.test(f));
    if (filas.length === 0) return bloque;
    let tabla = '<table>';
    filas.forEach((fila, i) => {
      const celdas = fila.split('|').filter(c => c.trim() !== '');
      const tag = i === 0 ? 'th' : 'td';
      const wrapFila = i === 0 ? 'thead' : (i === 1 ? 'tbody' : '');
      if (wrapFila === 'thead') tabla += '<thead>';
      if (wrapFila === 'tbody') tabla += '<tbody>';
      tabla += '<tr>' + celdas.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      if (i === 0) tabla += '</thead>';
    });
    tabla += '</tbody></table>';
    return tabla;
  });

  // Encabezados
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Separadores
  html = html.replace(/^---+$/gm, '<hr/>');

  // Listas ordenadas
  html = html.replace(/((?:^\d+\. .+\n(?:   .+\n)*)+)/gm, (bloque) => {
    const items = bloque.trim().split(/\n(?=\d+\. )/);
    return '<ol>' + items.map(li => '<li>' + li.replace(/^\d+\. /, '').replace(/\n   /g, '<br/>') + '</li>').join('') + '</ol>';
  });

  // Listas no ordenadas
  html = html.replace(/((?:^- .+\n(?:  .+\n)*)+)/gm, (bloque) => {
    const items = bloque.trim().split(/\n(?=- )/);
    return '<ul>' + items.map(li => '<li>' + li.replace(/^- /, '').replace(/\n  /g, '<br/>') + '</li>').join('') + '</ul>';
  });

  // Párrafos (líneas sueltas que no son tag HTML)
  html = html.split('\n').map(l => {
    const t = l.trim();
    if (!t) return '';
    if (/^</.test(t)) return t;
    return `<p>${t}</p>`;
  }).join('\n');

  return html;
}

const cuerpo = mdAHtml(md);

// ── 3. Envolver en HTML completo con estilos para impresión ─────────
const documento = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Manual de Usuario — Sistema de Iniciativas Legislativas</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

  :root {
    --azul: #003876;
    --azul-claro: #2151d1;
    --fondo: #fafbfc;
    --borde: #e2e6ea;
    --texto: #1a1a2e;
    --tenue: #5a6072;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.7;
    color: var(--texto);
    background: #fff;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 32px;
  }

  h1 { font-size: 26px; color: var(--azul); border-bottom: 3px solid var(--azul); padding-bottom: 8px; margin: 32px 0 16px; }
  h2 { font-size: 21px; color: var(--azul); border-bottom: 2px solid var(--borde); padding-bottom: 6px; margin: 28px 0 14px; }
  h3 { font-size: 17px; color: var(--azul-claro); margin: 22px 0 10px; }
  h4 { font-size: 15px; color: var(--texto); margin: 18px 0 8px; }
  h5 { font-size: 14px; color: var(--tenue); margin: 14px 0 6px; }

  p { margin: 8px 0; }
  hr { border: none; border-top: 1px solid var(--borde); margin: 24px 0; }

  a { color: var(--azul-claro); text-decoration: none; }
  a:hover { text-decoration: underline; }

  code {
    background: #f0f2f5;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12.5px;
    font-family: 'Consolas', 'Fira Code', monospace;
  }

  pre {
    background: #1e2029;
    color: #e8ecf1;
    padding: 16px 20px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 12px 0;
    font-size: 12.5px;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; color: inherit; }

  blockquote {
    border-left: 4px solid var(--azul-claro);
    background: #f0f4ff;
    padding: 12px 16px;
    margin: 12px 0;
    border-radius: 0 8px 8px 0;
    font-size: 13.5px;
    color: #1a3a6b;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
  }
  th, td {
    border: 1px solid var(--borde);
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background: var(--azul);
    color: #fff;
    font-weight: 600;
  }
  tr:nth-child(even) { background: #f8f9fb; }

  ul, ol { margin: 8px 0 8px 24px; }
  li { margin: 4px 0; }

  figure {
    margin: 16px 0;
    text-align: center;
  }
  figure img {
    max-width: 100%;
    border: 1px solid var(--borde);
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  figcaption {
    margin-top: 6px;
    font-size: 12px;
    color: var(--tenue);
    font-style: italic;
  }

  /* Mermaid placeholder */
  pre.mermaid {
    background: #f8f9fb;
    color: var(--texto);
    border: 1px dashed var(--borde);
    text-align: center;
    font-size: 12px;
  }

  /* Impresión */
  @media print {
    body { padding: 0; font-size: 11px; }
    h1 { font-size: 20px; }
    h2 { font-size: 16px; page-break-after: avoid; }
    h3, h4 { page-break-after: avoid; }
    figure { page-break-inside: avoid; }
    table { page-break-inside: avoid; }
    pre { font-size: 10px; }
    blockquote { background: #f0f4ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { background: var(--azul) !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${cuerpo}
</body>
</html>`;

fs.writeFileSync(archivoHtml, documento, 'utf8');
const tamano = (fs.statSync(archivoHtml).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ Generado: docs/ARQUITECTURA_TECNICA.html (${tamano} MB)`);
console.log('   Ábralo en el navegador y pulse Ctrl+P para guardar como PDF.');

