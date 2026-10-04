import { marked } from 'marked';
import katex from 'katex';

const textos = {
  'tabla con frac y sqrt': `**Ejemplo numérico**
| $x$ | $\\sin^{-1} x$ | $1-x^2$ | $\\frac{1}{\\sqrt{1-x^{2}}}$ |
|---|---|---|---|
| $0$ | $0$ | $1$ | $1$ |
| $0.5$ | $0.524$ | $0.75$ | $1.155$ |`,
  'linea del material': `En la sección de derivadas inversas se muestra $\\frac{d}{dx} \\sin^{-1} x = \\frac{1}{\\sqrt{1-x^2}}.$`,
  'display grande': `Se define
$$\\frac{d}{dx}\\sin^{-1}x = \\frac{1}{\\sqrt{1-x^{2}}}$$
y listo.`,
};

function pipelineNuevo(value) {
  let v = value;
  const formulas = [];
  const guardarFormula = (html) => `@@MATH${formulas.push(html) - 1}@@`;
  v = v.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (m, p1, p2) => {
    try { return guardarFormula(katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false })); } catch { return m; }
  });
  v = v.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (m, p1, p2) => {
    try { return guardarFormula(katex.renderToString(p1 || p2, { displayMode: false, throwOnError: false })); } catch { return m; }
  });
  const useInline = !/\n/.test(v);
  let html = useInline ? marked.parseInline(v, { async: false }) : marked.parse(v, { async: false });
  html = html.replace(/@@MATH(\d+)@@/g, (m, i) => formulas[Number(i)] ?? m);
  return html;
}

for (const [nombre, texto] of Object.entries(textos)) {
  const html = pipelineNuevo(texto);
  const svgComoTexto = /&lt;svg|&lt;path|M834 80h400000|M95,702|@@MATH/.test(html);
  const tabla = html.includes('<table') ? `tabla SI (${(html.match(/<tr>/g) || []).length} filas)` : (nombre.startsWith('tabla') ? 'tabla NO' : '');
  const katexOk = html.includes('class="katex"') ? 'katex SI' : 'katex NO';
  console.log(`--- ${nombre}: ${tabla} ${katexOk} roto-no-restaurado: ${svgComoTexto ? 'SI ✘' : 'NO ✔'}`);
}
console.log('\n(recordatorio: "roto-no-restaurado" detecta SVG como texto, marcadores @@MATH sin resolver o svg escapados)');
