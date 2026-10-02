import { Pipe, PipeTransform } from '@angular/core';

/** Símbolos y comandos LaTeX que tienen un equivalente Unicode legible. */
const SYMBOLS: Array<[RegExp, string]> = [
  [/\\infty/g, '∞'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\cdot/g, '·'],
  [/\\leq|\\le(?![a-z])/g, '≤'],
  [/\\geq|\\ge(?![a-z])/g, '≥'],
  [/\\neq|\\ne(?![a-z])/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\equiv/g, '≡'],
  [/\\cup/g, '∪'],
  [/\\cap/g, '∩'],
  [/\\subseteq/g, '⊆'],
  [/\\subset/g, '⊂'],
  [/\\in(?![a-z])/g, '∈'],
  [/\\notin/g, '∉'],
  [/\\forall/g, '∀'],
  [/\\exists/g, '∃'],
  [/\\partial/g, '∂'],
  [/\\nabla/g, '∇'],
  [/\\sum/g, 'Σ'],
  [/\\prod/g, '∏'],
  [/\\int/g, '∫'],
  [/\\to|\\rightarrow/g, '→'],
  [/\\Rightarrow/g, '⇒'],
  [/\\Leftrightarrow/g, '⇔'],
  [/\\angle/g, '∠'],
  [/\\pi/g, 'π'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\delta/g, 'δ'],
  [/\\epsilon|\\varepsilon/g, 'ε'],
  [/\\theta/g, 'θ'],
  [/\\lambda/g, 'λ'],
  [/\\mu/g, 'μ'],
  [/\\sigma/g, 'σ'],
  [/\\tau/g, 'τ'],
  [/\\phi/g, 'φ'],
  [/\\omega/g, 'ω'],
  [/\\Delta/g, 'Δ'],
  [/\\Sigma/g, 'Σ'],
  [/\\Omega/g, 'Ω'],
  [/\\mathbb\{R\}/g, 'ℝ'],
  [/\\mathbb\{N\}/g, 'ℕ'],
  [/\\mathbb\{Z\}/g, 'ℤ'],
  [/\\mathbb\{Q\}/g, 'ℚ'],
  [/\\mathbb\{C\}/g, 'ℂ'],
];

/**
 * Convierte un texto con Markdown/LaTeX (por ejemplo el enunciado de una flashcard)
 * en texto plano legible: "Resuelve $\log_{3}(x)=2$" -> "Resuelve log₃(x) = 2".
 *
 * Se usa para títulos, listas y chips, donde el pipe `markdown` (que renderiza
 * KaTeX de verdad) sería demasiado pesado o demasiado alto.
 */
export function toPlainMath(value: string | null | undefined): string {
  if (!value) return '';
  let out = String(value);

  // Delimitadores matemáticos: nos quedamos con el contenido.
  out = out
    .replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ')
    .replace(/\$([^$]*)\$/g, ' $1 ')
    .replace(/\\\[([\s\S]*?)\\\]/g, ' $1 ')
    .replace(/\\\(([\s\S]*?)\\\)/g, ' $1 ');

  // Markdown básico (negritas, itálicas, código, encabezados, enlaces).
  out = out
    .replace(/\[(.+?)\]\((?:[^)]+)\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`+([^`]+)`+/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '');

  // Fracciones y raíces (varias pasadas por si están anidadas).
  for (let i = 0; i < 3; i += 1) {
    out = out
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\[[^\]]*\]\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  }

  // Funciones y operadores con nombre.
  out = out
    .replace(/\\(log|ln|exp|sin|cos|tan|arcsin|arccos|arctan|lim|max|min|det|gcd)\b/g, '$1')
    .replace(/\\operatorname\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:text|mathrm|mathit|mathbf|textbf|boldsymbol|mbox)\s*\{([^{}]*)\}/g, '$1');

  for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);

  // Subíndices y superíndices: \log_{3} -> log_3, x^{2} -> x^2.
  out = out.replace(/([_^])\{([^{}]*)\}/g, '$1$2');
  out = out.replace(/\s*_\s*(\w)/g, (_, digit: string) => SUBSCRIPTS[digit] || `_${digit}`);
  out = out.replace(/\s*\^\s*(\w)/g, (_, digit: string) => SUPERSCRIPTS[digit] || `^${digit}`);

  // Limpieza final: espacios de control, \left \right y barras sobrantes.
  out = out
    .replace(/\\left|\\right/g, '')
    .replace(/\\[,;:!>]/g, ' ')
    .replace(/\\+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,;:)\]])/g, '$1')
    .replace(/^\s+|\s+$/g, '');

  return out;
}

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  n: 'ₙ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', a: 'ₐ', x: 'ₓ',
};

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  n: 'ⁿ', i: 'ⁱ', x: 'ˣ',
};

@Pipe({ name: 'plainMath', standalone: true })
export class PlainMathPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return toPlainMath(value);
  }
}
