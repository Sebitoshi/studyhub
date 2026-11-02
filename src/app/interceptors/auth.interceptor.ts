import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Marca la petición reintentada para no entrar en un bucle de refresh. */
const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const auth = inject(AuthService);

  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  const token = auth.getToken();
  const authorized = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      // Login, refresh, etc. manejan sus propios 401.
      if (req.url.includes('/auth/')) {
        return throwError(() => error);
      }

      // Ya reintentamos y sigue fallando, o no hay forma de renovar.
      if (req.context.get(RETRIED_AFTER_REFRESH) || !auth.getRefreshToken()) {
        auth.forceLogout();
        return throwError(() => error);
      }

      // Otra pestaña ya renovó el token mientras esta petición iba en camino.
      const currentToken = auth.getToken();
      if (currentToken && currentToken !== token) {
        return next(
          req.clone({
            setHeaders: { Authorization: `Bearer ${currentToken}` },
            context: req.context.set(RETRIED_AFTER_REFRESH, true),
          })
        );
      }

      return auth.refreshSession().pipe(
        switchMap(res =>
          next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${res.access_token}` },
              context: req.context.set(RETRIED_AFTER_REFRESH, true),
            })
          )
        ),
        catchError(() => {
          auth.forceLogout();
          return throwError(() => error);
        })
      );
    })
  );
};
