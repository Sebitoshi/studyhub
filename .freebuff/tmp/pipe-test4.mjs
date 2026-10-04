import { marked } from 'marked';
import katex from 'katex';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Réplica EXACTA del pipe (markdown.pipe.ts) con el fix
function pipeNuevo(value, autoMath = false) {
  let processedValue = value;
  const formulas = [];
  const guardarFormula = (html) => `@@MATH${formulas.push(html) - 1}@@`;
  processedValue = processedValue.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (m, p1, p2) => {
    try { return guardarFormula(katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false })); } catch { return m; }
  });
  processedValue = processedValue.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (m, p1, p2) => {
    try { return guardarFormula(katex.renderToString(p1 || p2, { displayMode: false, throwOnError: false })); } catch { return m; }
  });
  const useInline = autoMath && !/\n/.test(processedValue);
  let html = useInline
    ? marked.parseInline(processedValue, { async: false })
    : marked.parse(processedValue, { async: false });
  html = html.replace(/@@MATH(\d+)@@/g, (m, i) => formulas[Number(i)] ?? m);
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['span', 'div', 'math', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'mspace', 'msqrt', 'mfrac', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'msubsup', 'msup', 'msub', 'mmultiscripts', 'mover', 'munder', 'munderover', 'annotation', 'table', 'tbody', 'thead', 'tr', 'th', 'td', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'a', 'img'],
    ADD_ATTR: ['display', 'xmlns', 'class', 'style', 'aria-hidden', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan'],
  });
}

// Réplica del pipe VIEJO para comparar
function pipeViejo(value, autoMath = false) {
  let processedValue = value;
  processedValue = processedValue.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (m, p1, p2) => {
    try { return katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false }); } catch { return m; }
  });
  processedValue = processedValue.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (m, p1, p2) => {
    try { return katex.renderToString(p1 || p2, { displayMode: false, throwOnError: false }); } catch { return m; }
  });
  const useInline = autoMath && !/\n/.test(processedValue);
  const html = useInline ? marked.parseInline(processedValue, { async: false }) : marked.parse(processedValue, { async: false });
  return DOMPurify.sanitize(html, { ADD_TAGS: ['span', 'div', 'math'], ADD_ATTR: ['class', 'style', 'aria-hidden'] });
}

const texto = `En la sección de derivadas inversas se muestra $\\frac{d}{dx} \\sin^{-1} x = \\frac{1}{\\sqrt{1-x^2}}.$

**Ejemplo numérico**
| $x$ | $\\sin^{-1} x$ | $1-x^2$ | $\\frac{1}{\\sqrt{1-x^{2}}}$ |
|---|---|---|---|
| $0$ | $0$ | $1$ | $1$ |
| $0.5$ | $0.524$ | $0.75$ | $1.155$ |

**Tip:** la derivada de $\\arcsin$ lleva una raíz: $\\frac{1}{\\sqrt{1-x^2}}$.`;

function diagnostico(html) {
  const sinTags = html.replace(/<[^>]+>/g, ' ');
  return {
    tabla: (html.match(/<tr>/g) || []).length + ' filas',
    katex: (html.match(/class="katex"/g) || []).length + ' fórmulas',
    svg: (html.match(/<svg/g) || []).length + ' svg / ' + (html.match(/<\/svg>/g) || []).length + ' cierres',
    'path como TEXTO visible': /M834|M95,|M400000/.test(sinTags) ? 'SI ✘' : 'NO ✔',
    'marcador sin restaurar': /@@MATH/.test(html) ? 'SI ✘' : 'NO ✔',
    'HTML escapado': /&lt;|&gt;/.test(html) ? 'SI ✘' : 'NO ✔',
  };
}

console.log('=== PIPE VIEJO ===');
console.log(diagnostico(pipeViejo(texto)));
console.log('=== PIPE NUEVO (fix) ===');
console.log(diagnostico(pipeNuevo(texto)));

// El HTML nuevo, guardado para inspección visual
import { writeFileSync } from 'fs';
writeFileSync('.freebuff/tmp/pipe-preview-body.html', pipeNuevo(texto));
