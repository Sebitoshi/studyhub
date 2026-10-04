import { marked } from 'marked';
import katex from 'katex';

const texto = `**Ejemplo numérico**
| $x$ | $\\sin^{-1} x$ | $1-x^2$ |
|---|---|---|
| $0$ | $0$ | $1$ |
| $0.5$ | $0.524$ | $0.75$ |`;

function pipeline(value) {
  let v = value;
  v = v.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (m, p1, p2) => katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false }));
  v = v.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (m, p1, p2) => katex.renderToString(p1 || p2, { displayMode: false, throwOnError: false }));
  return marked.parse(v, { async: false });
}

const html = pipeline(texto);
console.log('=== ¿salio tabla? ===', html.includes('<table') ? 'SI' : 'NO');
console.log('=== ¿quedo SVG como texto? ===', /&lt;svg|M834 80h400000/.test(html) ? 'SI' : 'NO');
console.log(html.slice(0, 1200));
