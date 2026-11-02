import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface BillingPlan {
  code: string;
  name: string;
  description: string;
  priceCop: number;
  currency: string;
  /** -1 = ilimitados. */
  dailyCredits: number;
  features: string[];
  premium: boolean;
}

export interface BillingSubscriptionInfo {
  status: string;
  provider: string;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  initPoint: string | null;
}

export interface BillingAccount {
  planCode: string;
  planName: string;
  premium: boolean;
  dailyCredits: number | null;
  used: number;
  remaining: number | null;
  premiumUsed: number;
  subscription: BillingSubscriptionInfo | null;
}

export interface StartSubscriptionResponse {
  planCode: string;
  subscriptionId: string;
  initPoint: string | null;
  status: string;
  amountCop: number;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private http = inject(HttpClient);
  private apiUrl = 'https://study-hub-backend-sigma.vercel.app/billing';

  /** Último estado conocido de la cuenta (plan, suscripción y créditos del día). */
  readonly account = signal<BillingAccount | null>(null);
  readonly plans = signal<BillingPlan[]>([]);
  readonly loading = signal(false);

  getPlans(): Observable<{ currency: string; plans: BillingPlan[] }> {
    return this.http
      .get<{ currency: string; plans: BillingPlan[] }>(`${this.apiUrl}/plans`)
      .pipe(tap((res) => this.plans.set(res?.plans ?? [])));
  }

  getAccount(): Observable<BillingAccount> {
    return this.http
      .get<BillingAccount>(`${this.apiUrl}/me`)
      .pipe(tap((account) => this.account.set(account)));
  }

  /** Refresca el estado sin bloquear la vista. */
  refresh(): void {
    this.loading.set(true);
    this.getAccount().subscribe({
      next: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
  }

  subscribe(planCode = 'PREMIUM'): Observable<StartSubscriptionResponse> {
    return this.http.post<StartSubscriptionResponse>(`${this.apiUrl}/subscribe`, { planCode });
  }

  cancel(): Observable<BillingAccount> {
    return this.http
      .post<BillingAccount>(`${this.apiUrl}/cancel`, {})
      .pipe(tap((account) => this.account.set(account)));
  }
}
