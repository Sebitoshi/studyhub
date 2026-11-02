import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div class="flex min-h-screen items-center justify-center">
      <p class="text-gray-500 animate-pulse">Completando inicio de sesión…</p>
    </div>
  `,
  styles: [`:host { display: contents; }`]
})
export class AuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const token = this.route.snapshot.queryParamMap.get('token');
    const refreshToken = this.route.snapshot.queryParamMap.get('refresh');
    const userRaw = this.route.snapshot.queryParamMap.get('user');

    if (!token) {
      console.warn('[AuthCallback] No se recibió token en la URL');
    }
    if (!userRaw) {
      console.warn('[AuthCallback] No se recibió usuario en la URL');
    }

    if (!token || !userRaw) {
      this.router.navigate(['/login']);
      return;
    }

    try {
      const decoded = decodeURIComponent(userRaw);
      const user = JSON.parse(decoded);
      this.auth.setSessionFromGoogle({
        access_token: token,
        refresh_token: refreshToken ?? undefined,
        user,
      });
      this.router.navigate(['/dashboard']);
    } catch (e) {
      console.error('[AuthCallback] Error al procesar el usuario:', e);
      this.router.navigate(['/login']);
    }
  }
}
