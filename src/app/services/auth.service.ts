import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
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
  user: {
    id: number;
    nombre: string;
    apellido: string;
    email: string;
    foto?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private apiUrl = `${'https://study-hub-backend-sigma.vercel.app'}/auth`;

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
      const token = localStorage.getItem('access_token');
      if (token) {
        this.http.post(`${this.apiUrl}/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        }).subscribe();
      }
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
    AppCache.clear();
    this.router.navigate(['/']);
  }

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('access_token');
    }
    return null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
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
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
    }
  }
}
