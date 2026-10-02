import { Component, inject, signal, afterNextRender } from '@angular/core';
import { ConsentService } from '../../services/consent.service';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [],
  templateUrl: './cookie-consent.component.html',
  styles: [`:host { display: contents; }`],
})
export class CookieConsentComponent {
  private consent = inject(ConsentService);

  /** Arranca en false para que el HTML del servidor y el del cliente coincidan. */
  visible = signal(false);

  constructor() {
    // Solo en el navegador y después de hidratar: así no rompe el SSR.
    afterNextRender(() => {
      if (!this.consent.hasDecided()) {
        this.visible.set(true);
      }
    });
  }

  acceptAll(): void {
    this.consent.accept(true);
    this.visible.set(false);
  }

  acceptEssential(): void {
    this.consent.accept(false);
    this.visible.set(false);
  }
}
