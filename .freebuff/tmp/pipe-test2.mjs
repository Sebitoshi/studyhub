import { marked } from 'marked';
import katex from 'katex';

const textos = {
  'tabla con frac y sqrt': `**Ejemplo numérico**
| $x$ | $\\sin^{-1} x$ | $1-x^2$ | $\\frac{1}{\\sqrt{1-x^{2}}}$ |
|---|---|---|---|
| $0$ | $0$ | $1$ | $1$ |
| $0.5$ | $0.524$ | $0.75$ | $1.155$ |`,
  'display con frac': `Se muestra
$$\\frac{d}{dx}\\sin^{-1}x = \\frac{1}{\\sqrt{1-x^{2}}}$$
y listo.`,
  'parrafo con frac inline': `Como $\\cos y = \\sqrt{1 - \\sin^2 y} = \\sqrt{1 - x^2}$, obtenemos $\\frac{dy}{dx} = \\frac{1}{\\cos y}$.`,
};

function pipeline(value) {
  let v = value;
  v = v.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (m, p1, p2) => katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false }));
  v = v.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (m, p1, p2) => katex.renderToString(p1 || p2, { displayMode: false, throwOnError: false }));
  return marked.parse(v, { async: false });
}

for (const [nombre, texto] of Object.entries(textos)) {
  const html = pipeline(texto);
  const svgComoTexto = /&lt;svg|&lt;path|M834 80h400000|M95,702/.test(html);
  const tablaOk = nombre.startsWith('tabla') ? (html.includes('<table') ? 'tabla SI' : 'tabla NO') : '';
  console.log(`--- ${nombre}: ${tablaOk} svg-como-texto: ${svgComoTexto ? 'SI' : 'NO'}`);
  if (svgComoTexto) {
    const m = html.match(/.{60}M834 80h400000.{60}/s) || html.match(/.{60}&lt;svg.{60}/s);
    if (m) console.log('   fragmento:', JSON.stringify(m[0]));
  }
  if (nombre.startsWith('tabla')) console.log('   filas <tr>:', (html.match(/<tr>/g) || []).length);
}
