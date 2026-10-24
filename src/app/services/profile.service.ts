import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError } from 'rxjs';
import { AppCache } from '../utils/cache';

const API = 'https://study-hub-backend-sigma.vercel.app'!;

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);
  personal = signal<any>(null);
  academic = signal<any>(null);
  professional = signal<any>(null);
  skills = signal<any[]>([]);
  saving = signal(false);

  // Aliases for backward compat with mi-cv component
  personalInfo() { return this.personal(); }

  getPersonal(forceRefresh = false): Observable<any> {
    if (!forceRefresh) {
      const cached = AppCache.get<any>('profile_personal');
      if (cached) {
        this.personal.set(cached);
        return of(cached);
      }
    }
    return this.http.get<any>(`${API}/profile/personal`).pipe(
      tap(d => { this.personal.set(d); AppCache.set('profile_personal', d); }),
      catchError(() => { this.personal.set({}); return of({}); })
    );
  }

  // Alias
  getPersonalInfo(): Observable<any> { return this.getPersonal(); }
  updatePersonalInfo(dto: any): Observable<any> { return this.updatePersonal(dto); }

  updatePersonal(dto: any): Observable<any> {
    this.saving.set(true);
    return this.http.put<any>(`${API}/profile/personal`, dto).pipe(
      tap({ next: d => { this.personal.set(d); AppCache.set('profile_personal', d); this.saving.set(false); }, error: () => this.saving.set(false) })
    );
  }

  getAcademic(forceRefresh = false): Observable<any> {
    if (!forceRefresh) {
      const cached = AppCache.get<any>('profile_academic');
      if (cached) {
        this.academic.set(cached);
        return of(cached);
      }
    }
    return this.http.get<any>(`${API}/profile/academic`).pipe(
      tap(d => { this.academic.set(d); AppCache.set('profile_academic', d); }),
      catchError(() => { this.academic.set({}); return of({}); })
    );
  }

  updateAcademic(dto: any): Observable<any> {
    this.saving.set(true);
    return this.http.put<any>(`${API}/profile/academic`, dto).pipe(
      tap({ next: d => { this.academic.set(d); AppCache.set('profile_academic', d); this.saving.set(false); }, error: () => this.saving.set(false) })
    );
  }

  createAcademic(dto: any): Observable<any> {
    this.saving.set(true);
    return this.http.post<any>(`${API}/profile/academic`, dto).pipe(
      tap({ next: d => { this.academic.set(d); AppCache.set('profile_academic', d); this.saving.set(false); }, error: () => this.saving.set(false) })
    );
  }

  getProfessional(forceRefresh = false): Observable<any> {
    if (!forceRefresh) {
      const cached = AppCache.get<any>('profile_professional');
      if (cached) {
        this.professional.set(cached);
        return of(cached);
      }
    }
    return this.http.get<any>(`${API}/profile/professional`).pipe(
      tap(d => { this.professional.set(d); AppCache.set('profile_professional', d); }),
      catchError(() => { this.professional.set({}); return of({}); })
    );
  }

  updateProfessional(dto: any): Observable<any> {
    this.saving.set(true);
    return this.http.put<any>(`${API}/profile/professional`, dto).pipe(
      tap({ next: d => { this.professional.set(d); AppCache.set('profile_professional', d); this.saving.set(false); }, error: () => this.saving.set(false) })
    );
  }

  createProfessional(dto: any): Observable<any> {
    this.saving.set(true);
    return this.http.post<any>(`${API}/profile/professional`, dto).pipe(
      tap({ next: d => { this.professional.set(d); AppCache.set('profile_professional', d); this.saving.set(false); }, error: () => this.saving.set(false) })
    );
  }

  getUserSkills(forceRefresh = false): Observable<any[]> {
    if (!forceRefresh) {
      const cached = AppCache.get<any[]>('profile_skills');
      if (cached) {
        this.skills.set(cached);
        return of(cached);
      }
    }
    return this.http.get<any[]>(`${API}/profile/skills`).pipe(
      tap(s => { this.skills.set(s); AppCache.set('profile_skills', s); }),
      catchError(() => { this.skills.set([]); return of([]); })
    );
  }

  /** Refleja al instante la foto recién subida (la API ya la guardó en MongoDB). */
  setAvatar(foto: string | null): void {
    const current = this.personal() ?? {};
    const next = { ...current, foto };
    this.personal.set(next);
    AppCache.set('profile_personal', next);
    AppCache.invalidate('dashboard');
  }

  invalidateAllCache(): void {
    AppCache.invalidatePrefix('profile_');
  }
}
