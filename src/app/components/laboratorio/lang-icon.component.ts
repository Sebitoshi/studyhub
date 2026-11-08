import { Component, Input } from '@angular/core';
import { SandboxLanguage } from '../../services/sandbox.service';

/**
 * Icono SVG de cada lenguaje del sandbox (sin emojis).
 * `branded=true` aplica el color corporativo del lenguaje; por defecto usa
 * currentColor para adaptarse al contexto (ej. botones activos).
 */
@Component({
  selector: 'app-lang-icon',
  standalone: true,
  template: `
    @switch (lang) {
      @case ('python') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0" [attr.style]="branded ? 'color:' + color : null">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      }
      @case ('java') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0" [attr.style]="branded ? 'color:' + color : null">
          <path d="M10 2v2"></path>
          <path d="M14 2v2"></path>
          <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"></path>
          <path d="M6 2v2"></path>
        </svg>
      }
      @case ('javascript') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0" [attr.style]="branded ? 'color:' + color : null">
          <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"></path>
          <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path>
        </svg>
      }
      @case ('sql') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0" [attr.style]="branded ? 'color:' + color : null">
          <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
          <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
          <path d="M3 12A9 3 0 0 0 21 12"></path>
        </svg>
      }
      @default {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0" [attr.style]="branded ? 'color:' + color : null">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      }
    }
  `,
})
export class LangIconComponent {
  @Input() lang: SandboxLanguage = 'python';
  @Input() branded = false;

  /** Color corporativo de cada lenguaje (coincide con SANDBOX_LANGUAGES). */
  get color(): string {
    switch (this.lang) {
      case 'python': return '#3572A5';
      case 'java': return '#B07219';
      case 'javascript': return '#F7DF1E';
      case 'sql': return '#003B57';
      default: return '#0C5A60';
    }
  }
}
