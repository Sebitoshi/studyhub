import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface CookieConsentDecision {
  /** true si el usuario aceptó cookies de análisis/mejora de experiencia. */
  analytics: boolean;
  decidedAt: string;
}

const STORAGE_KEY = 'studyhub_cookie_consent_v1';

/**
 * Recuerda la decisión del usuario sobre las cookies para no volver a
 * preguntar en cada visita ni en cada pestaña nueva.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private platformId = inject(PLATFORM_ID);

  decision = signal<CookieConsentDecision | null>(this.read());

  hasDecided(): boolean {
    return this.read() !== null;
  }

  accept(analytics: boolean): void {
    const decision: CookieConsentDecision = {
      analytics,
      decidedAt: new Date().toISOString(),
    };

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decision));
    }

    this.decision.set(decision);
  }

  allowsAnalytics(): boolean {
    return this.decision()?.analytics ?? false;
  }

  private read(): CookieConsentDecision | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CookieConsentDecision) : null;
    } catch {
      return null;
    }
  }
}
