import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, throwError, tap, finalize, shareReplay, catchError } from 'rxjs';
import { AppCache } from '../utils/cache';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  access_token: string;
  /** Token de larga duración para renovar el acceso sin volver a loguearse. */
  refresh_token?: string;
  user: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
    foto?: string | null;
  };
}

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private apiUrl = `${'https://study-hub-backend-sigma.vercel.app'}/auth`;

  /** Evita lanzar varias renovaciones en paralelo desde la misma pestaña. */
  private refreshInFlight: Observable<AuthResponse> | null = null;

  login(data: LoginRequest): Observable<AuthResponse> {
    AppCache.clear();
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap(res => this.setSession(res))
    );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    AppCache.clear();
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap(res => this.setSession(res))
    );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        // Revoca la sesión en el backend; si falla, igual limpiamos localmente.
        this.http.post(`${this.apiUrl}/logout`, { refresh_token: refreshToken }).subscribe({
          error: () => undefined,
        });
      }
      this.clearSession();
    }
    AppCache.clear();
    this.router.navigate(['/']);
  }

  /**
   * Renueva el token de acceso usando el refresh token.
   * El backend rota el refresh token en cada llamada, así que la respuesta
   * debe guardarse siempre (lo hace `setSession`).
   */
  refreshSession(): Observable<AuthResponse> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    if (!this.getRefreshToken()) {
      return throwError(() => new Error('No hay refresh token'));
    }

    this.refreshInFlight = this.performRefresh().pipe(
      tap(res => this.setSession(res)),
      finalize(() => {
        this.refreshInFlight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    return this.refreshInFlight;
  }

  /**
   * Si otra pestaña rotó el refresh token justo antes, el nuestro queda
   * inválido. Como localStorage es compartido, reintentamos una vez con el
   * token más reciente para no cerrar la sesión por una carrera entre pestañas.
   */
  private performRefresh(attempt = 0): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No hay refresh token'));
    }

    return this.http
      .post<AuthResponse>(`${this.apiUrl}/refresh`, { refresh_token: refreshToken })
      .pipe(
        catchError((error: unknown) => {
          const latest = this.getRefreshToken();
          if (
            attempt === 0 &&
            error instanceof HttpErrorResponse &&
            error.status === 401 &&
            latest &&
            latest !== refreshToken
          ) {
            return this.performRefresh(1);
          }
          return throwError(() => error);
        })
      );
  }

  /** Cierra la sesión local cuando el refresh token ya no es válido. */
  forceLogout(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.clearSession();
    }
    AppCache.clear();

    if (isPlatformBrowser(this.platformId) && !this.router.url.startsWith('/login')) {
      void this.router.navigate(['/login'], { queryParams: { expired: '1' } });
    }
  }

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    }
    return null;
  }

  getRefreshToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return null;
  }

  isLoggedIn(): boolean {
    return !!(this.getToken() || this.getRefreshToken());
  }

  setSessionFromGoogle(res: AuthResponse): void {
    AppCache.clear();
    this.setSession(res);
  }

  verifyEmail(email: string, code: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/verify-email`, { email, code });
  }

  resendCode(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/resend-code`, { email });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, { token, password });
  }

  private setSession(res: AuthResponse): void {
    if (!isPlatformBrowser(this.platformId)) return;

    localStorage.setItem(ACCESS_TOKEN_KEY, res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));

    if (res.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
    }
  }

  private clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}
