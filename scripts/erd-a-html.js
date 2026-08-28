/**
 * Convierte MODELO_DATOS_ERD.md en un HTML autocontenido con soporte de renderizado
 * de diagramas Mermaid para visualización en navegador y exportación a PDF (Ctrl+P).
 *
 * Uso: node scripts/erd-a-html.js
 * Salida: docs/MODELO_DATOS_ERD.html
 */

const fs = require('fs');
const path = require('path');

const carpetaDocs = path.join(__dirname, '..', 'docs');
const archivoMd = path.join(carpetaDocs, 'MODELO_DATOS_ERD.md');
const archivoHtml = path.join(carpetaDocs, 'MODELO_DATOS_ERD.html');

let md = fs.readFileSync(archivoMd, 'utf8');

function mdAHtml(texto) {
  let html = texto;

  // Bloques de código con mermaid → renderizables por mermaid.js
  html = html.replace(/```mermaid\r?\n([\s\S]*?)```/g, (_m, code) =>
    `<div class="mermaid-wrap"><pre class="mermaid">${code.trim()}</pre></div>`
  );

  // Bloques de código genéricos
  html = html.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_m, lang, code) =>
    `<pre><code class="language-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
  );

  // Código inline
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Enlaces
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Negritas e itálicas
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\r?\n<blockquote>/g, '<br/>');

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
  html = html.replace(/((?:^\d+\. .+\r?\n(?:   .+\r?\n)*)+)/gm, (bloque) => {
    const items = bloque.trim().split(/\n(?=\d+\. )/);
    return '<ol>' + items.map(li => '<li>' + li.replace(/^\d+\. /, '').replace(/\n   /g, '<br/>') + '</li>').join('') + '</ol>';
  });

  // Listas no ordenadas
  html = html.replace(/((?:^- .+\r?\n(?:  .+\r?\n)*)+)/gm, (bloque) => {
    const items = bloque.trim().split(/\n(?=- )/);
    return '<ul>' + items.map(li => '<li>' + li.replace(/^- /, '').replace(/\n  /g, '<br/>') + '</li>').join('') + '</ul>';
  });

  // Párrafos
  html = html.split('\n').map(l => {
    const t = l.trim();
    if (!t) return '';
    if (/^</.test(t)) return t;
    return `<p>${t}</p>`;
  }).join('\n');

  return html;
}

const cuerpo = mdAHtml(md);

const documento = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Modelo de Datos y ERD (Nivel 3) — Sistema de Iniciativas Legislativas</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap');

  :root {
    --azul-gov: #003876;
    --azul-accion: #2151d1;
    --azul-claro: #f0f4ff;
    --borde: #dbe0e6;
    --borde-suave: #edf0f4;
    --texto: #1a202c;
    --tenue: #4a5568;
    --fondo: #ffffff;
    --fondo-alt: #f8fafc;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--texto);
    background: var(--fondo);
    max-width: 1100px;
    margin: 0 auto;
    padding: 48px 36px;
  }

  h1 {
    font-size: 26px;
    font-weight: 700;
    color: var(--azul-gov);
    border-bottom: 3px solid var(--azul-gov);
    padding-bottom: 12px;
    margin: 36px 0 16px;
  }

  h2 {
    font-size: 20px;
    font-weight: 700;
    color: var(--azul-gov);
    border-bottom: 2px solid var(--borde);
    padding-bottom: 8px;
    margin: 32px 0 14px;
  }

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--azul-accion);
    margin: 24px 0 10px;
  }

  h4 {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--texto);
    margin: 18px 0 8px;
  }

  p { margin: 8px 0; }
  hr { border: none; border-top: 1px solid var(--borde); margin: 28px 0; }

  a { color: var(--azul-accion); text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }

  code {
    background: #f1f5f9;
    color: #0f172a;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'Fira Code', 'Consolas', monospace;
  }

  pre {
    background: #0f172a;
    color: #f8fafc;
    padding: 16px 20px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 14px 0;
    font-size: 12px;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; color: inherit; }

  blockquote {
    border-left: 4px solid var(--azul-accion);
    background: var(--azul-claro);
    padding: 12px 18px;
    margin: 14px 0;
    border-radius: 0 8px 8px 0;
    font-size: 13px;
    color: #1e3a8a;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 12.5px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  th, td {
    border: 1px solid var(--borde);
    padding: 8px 12px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--azul-gov);
    color: #ffffff;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.2px;
  }
  tr:nth-child(even) { background: var(--fondo-alt); }
  tr:hover { background: #f1f5f9; }

  ul, ol { margin: 8px 0 8px 24px; }
  li { margin: 4px 0; }

  .mermaid-wrap {
    margin: 20px 0;
    padding: 16px;
    background: #ffffff;
    border: 1px solid var(--borde);
    border-radius: 8px;
    overflow-x: auto;
    text-align: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.03);
  }

  @media print {
    body { padding: 0; font-size: 11px; max-width: 100%; }
    h1 { font-size: 19px; }
    h2 { font-size: 15px; page-break-after: avoid; }
    h3, h4 { page-break-after: avoid; }
    table { page-break-inside: avoid; font-size: 10.5px; }
    .mermaid-wrap { page-break-inside: avoid; border: 1px solid #ccc; box-shadow: none; }
    blockquote { background: #f0f4ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { background: var(--azul-gov) !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      er: {
        useMaxWidth: true,
        diagramPadding: 20,
        layoutDirection: 'TB',
        minEntityWidth: 100,
        minEntityHeight: 75,
        entityPadding: 15,
        stroke: '#003876',
        fill: '#f8fafc',
        fontSize: 12
      }
    });
  });
</script>
</head>
<body>
${cuerpo}
</body>
</html>`;

fs.writeFileSync(archivoHtml, documento, 'utf8');
const tamano = (fs.statSync(archivoHtml).size / 1024).toFixed(1);
console.log(`\n✅ Generado: docs/MODELO_DATOS_ERD.html (${tamano} KB)`);
console.log('   Ábralo en el navegador para visualizar el diagrama ER interactivo o exportar a PDF (Ctrl+P).');
