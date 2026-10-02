import { Pipe, PipeTransform, inject, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'markdown', standalone: true, pure: false })
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  private lastValue = '';
  private lastAutoMath = false;
  private cachedHtml: SafeHtml = '';
  private loaded = false;

  private marked: any;
  private dompurify: any;
  private katex: any;

  constructor() {
    this.loadDependencies();
  }

  async loadDependencies() {
    const [markedLib, dompurifyLib, katexLib] = await Promise.all([
      import('marked'),
      import('dompurify'),
      import('katex')
    ]);
    this.marked = markedLib.marked;
    this.dompurify = dompurifyLib.default || dompurifyLib;
    this.katex = katexLib.default || katexLib;
    this.loaded = true;
    this.cdr.markForCheck();
  }

  /**
   * @param autoMath  Modo para fragmentos cortos (p. ej. opciones de quiz):
   *                  detecta LaTeX sin delimitadores ($...$) y lo envuelve
   *                  para que KaTeX lo renderice; además devuelve HTML inline
   *                  (sin <p>) para encajar dentro de spans.
   */
  transform(value: string, autoMath = false): SafeHtml {
    if (!value) return '';
    if (this.lastValue === value && this.lastAutoMath === autoMath && this.cachedHtml) return this.cachedHtml;

    this.lastValue = value;
    this.lastAutoMath = autoMath;

    if (!this.loaded) {
      // Mientras cargan marked/dompurify/katex se muestra el texto escapado: el
      // contenido viene de la IA y nunca debe inyectarse como HTML crudo.
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(value));
    }

    // 0. Normalizar LaTeX "desnudo" (sin $) en fragmentos tipo opción de quiz
    let processedValue = autoMath ? this.normalizeNakedLatex(value) : value;

    // 1. Pre-process math blocks (katex)
    //    Handle both \[ \] and \\[ \\] (backend double-escapes)
    processedValue = processedValue.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (match, p1, p2) => {
      try {
        return this.katex.renderToString(p1 || p2, { displayMode: true, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    //    Handle $...$ inline, \( \) and \\( \\) (backend double-escapes)
    processedValue = processedValue.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (match, p1, p2) => {
      try {
        return this.katex.renderToString(p1 || p2, { displayMode: false, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    // 2. Parse markdown (inline para fragmentos cortos sin saltos de bloque,
    //    así las opciones no generan un <p> envolvente dentro del <span>)
    const useInline = autoMath && !/\n/.test(processedValue);
    const html = useInline
      ? (this.marked.parseInline(processedValue, { async: false }) as string)
      : (this.marked.parse(processedValue, { async: false }) as string);

    // 3. Purify HTML — allow KaTeX output (spans) + standard HTML + MathML
    const cleanHtml = this.dompurify.sanitize(html, {
      ADD_TAGS: [
        // KaTeX generated HTML
        'span', 'div',
        // MathML
        'math', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'mspace', 'msqrt', 'mfrac', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'mfenced', 'msubsup', 'msup', 'msub', 'mmultiscripts', 'mover', 'munder', 'munderover', 'annotation',
        // Tables
        'table', 'tbody', 'thead', 'tr', 'th', 'td',
        // Standard HTML
        'p', 'br', 'hr', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'a', 'img',
      ],
      ADD_ATTR: ['display', 'xmlns', 'class', 'style', 'aria-hidden', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan'],
    });

    this.cachedHtml = this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    return this.cachedHtml;
  }

  /**
   * Convierte LaTeX sin delimitadores a formato $...$ para que KaTeX lo renderice.
   * La IA suele escribir el enunciado con $...$ pero a veces genera las opciones
   * sin los delimitadores (p. ej. `(-\infty, 2) \cup (2, \infty)` o
   * `\mathbb{R} \setminus \{2\}`), lo que mostraba el código LaTeX crudo.
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private normalizeNakedLatex(value: string): string {
    // Ya tiene delimitadores de matemáticas → el procesado estándar lo renderiza
    if (/\$[^$\n]*\$/.test(value) || /\\\(/.test(value) || /\\\[/.test(value)) {
      return value;
    }
    // Sin comandos LaTeX → no hay nada que normalizar
    if (!/\\[a-zA-Z]/.test(value)) {
      return value;
    }

    const trimmed = value.trim();

    // ¿Hay prosa (palabras de 3+ letras) fuera de los comandos?
    const stripped = trimmed.replace(/\\[a-zA-Z]+(?:\s*\{[^{}]*\})?/g, '');
    const hasProse = /[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(stripped);

    if (!hasProse) {
      // Matemática pura: envolver todo el fragmento
      return '$' + trimmed + '$';
    }

    // Texto mixto: envolver solo el tramo que contiene comandos LaTeX
    const first = trimmed.search(/\\[a-zA-Z]/);
    if (first < 0) return value;
    const tokens = trimmed.match(/(?:\\[a-zA-Z]+\s*(?:\{[^{}]*\})?|\\[{}]|\{[^{}]*\})/g) || [];
    if (!tokens.length) return value;

    const lastToken = tokens[tokens.length - 1];
    const end = trimmed.lastIndexOf(lastToken) + lastToken.length;
    const segment = trimmed.slice(first, end);
    const segStripped = segment.replace(/\\[a-zA-Z]+(?:\s*\{[^{}]*\})?/g, '');

    if (/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}/.test(segStripped)) {
      // Hay prosa entre los comandos → envolver solo el primer comando
      const firstToken = tokens[0];
      if (firstToken) {
        const firstEnd = trimmed.indexOf(firstToken) + firstToken.length;
        return trimmed.slice(0, first) + '$' + trimmed.slice(first, firstEnd) + '$' + trimmed.slice(firstEnd);
      }
    }

    return trimmed.slice(0, first) + '$' + trimmed.slice(first, end).trimEnd() + '$' + trimmed.slice(end);
  }
}
