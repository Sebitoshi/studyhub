import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { PageHeaderComponent } from '../page-header/page-header.component';
import { BillingAccount, BillingPlan, BillingService } from '../../services/billing.service';
import { apiErrorMessage } from '../../utils/api-error';

@Component({
  selector: 'app-premium',
  standalone: true,
  imports: [CommonModule, SidebarComponent, PageHeaderComponent],
  templateUrl: './premium.component.html',
  styles: [`:host { display: contents; }`],
})
export class PremiumComponent implements OnInit {
  protected billing = inject(BillingService);
  private platformId = inject(PLATFORM_ID);

  startingPlan = signal<string | null>(null);
  cancelling = signal(false);
  error = signal<string | null>(null);
  notice = signal<string | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.billing.getPlans().subscribe({ error: () => {} });
    this.billing.refresh();

    // Mercado Pago vuelve a BILLING_BACK_URL con el resultado en la URL.
    const params = new URLSearchParams(window.location.search);
    const status = (params.get('status') || params.get('collection_status') || '').toLowerCase();
    if (['authorized', 'approved', 'ok'].includes(status)) {
      this.notice.set('¡Pago recibido! Estamos activando tu plan Premium…');
      // El webhook puede tardar unos segundos en llegar; se reintenta el estado.
      setTimeout(() => this.billing.refresh(), 4000);
      setTimeout(() => this.billing.refresh(), 12000);
    } else if (['rejected', 'failure', 'cancelled', 'pending'].includes(status)) {
      this.error.set(
        status === 'pending'
          ? 'Tu pago quedó pendiente de confirmación. Te avisaremos cuando se acredite.'
          : 'No se completó el pago. Puedes intentarlo de nuevo cuando quieras.',
      );
    }
  }

  premiumPlan(): BillingPlan | null {
    return this.billing.plans().find((plan) => plan.premium) ?? null;
  }

  freePlan(): BillingPlan | null {
    return this.billing.plans().find((plan) => !plan.premium) ?? null;
  }

  /** Precio del plan Premium; si aún no cargan los planes se usa el valor por defecto. */
  premiumPrice(): number {
    return this.premiumPlan()?.priceCop ?? 5000;
  }

  freeCredits(): number {
    return this.freePlan()?.dailyCredits ?? 25;
  }

  openCheckout(): void {
    this.error.set(null);
    this.notice.set(null);
    this.startingPlan.set('PREMIUM');

    this.billing.subscribe('PREMIUM').subscribe({
      next: (res) => {
        if (!res?.initPoint) {
          this.startingPlan.set(null);
          this.error.set('Mercado Pago no devolvió el enlace de pago. Inténtalo de nuevo.');
          return;
        }
        window.location.href = res.initPoint;
      },
      error: (err) => {
        this.startingPlan.set(null);
        this.error.set(apiErrorMessage(err, 'No pudimos iniciar el pago. Inténtalo de nuevo.'));
      },
    });
  }

  resumeCheckout(): void {
    const initPoint = this.billing.account()?.subscription?.initPoint;
    if (initPoint) window.location.href = initPoint;
  }

  cancel(): void {
    if (!window.confirm('¿Cancelar la renovación? Mantendrás Premium hasta el final del periodo pagado.')) {
      return;
    }
    this.error.set(null);
    this.cancelling.set(true);
    this.billing.cancel().subscribe({
      next: () => {
        this.cancelling.set(false);
        this.notice.set('Cancelaste la renovación. Tu plan sigue activo hasta el final del periodo.');
      },
      error: (err) => {
        this.cancelling.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cancelar la suscripción.'));
      },
    });
  }

  /** `null` en créditos significa ilimitado. */
  creditsLeft(account: BillingAccount | null): string {
    if (!account) return '—';
    if (account.premium || account.remaining === null || account.remaining < 0 || (account.dailyCredits ?? 0) < 0) return 'Ilimitados';
    return `${account.remaining} de ${account.dailyCredits} hoy`;
  }

  usagePercent(account: BillingAccount | null): number {
    if (!account || !account.dailyCredits) return 0;
    return Math.min(100, Math.round((account.used / account.dailyCredits) * 100));
  }

  formatCop(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'AUTHORIZED':
        return 'Activa';
      case 'PENDING':
        return 'Pago pendiente';
      case 'PAUSED':
        return 'En pausa';
      case 'CANCELLED':
        return 'Cancelada';
      case 'EXPIRED':
        return 'Vencida';
      default:
        return status || '';
    }
  }
}
