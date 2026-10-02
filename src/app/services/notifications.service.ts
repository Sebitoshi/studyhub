import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, interval, type Subscription } from 'rxjs';

const API = 'https://study-hub-backend-sigma.vercel.app'!;

/**
 * Cadencia del sondeo de notificaciones. En Vercel (serverless) no existe
 * WebSocket: socket.io se quedaba reconectando en bucle sin recibir nada y
 * saturaba el backend, así que el estado en vivo se mantiene por HTTP.
 */
const NOTIFICATIONS_POLL_MS = 45_000;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private http = inject(HttpClient);
  notifications = signal<any[]>([]);
  unreadCount = signal(0);
  private liveSub?: Subscription;

  getAll(): Observable<any> {
    return this.http.get<any>(`${API}/notifications`).pipe(
      tap(res => {
        const list = Array.isArray(res) ? res : (res?.data ?? res?.notifications ?? []);
        this.notifications.set(Array.isArray(list) ? list : []);
      }),
      catchError(() => { this.notifications.set([]); return []; })
    );
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(`${API}/notifications/unread-count`).pipe(
      tap(res => this.unreadCount.set(res?.count ?? 0)),
      catchError(() => { this.unreadCount.set(0); return []; })
    );
  }

  markAsRead(id: number): Observable<any> {
    return this.http.patch(`${API}/notifications/${id}/read`, {}).pipe(
      tap(() => {
        this.notifications.update(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
        this.unreadCount.update(c => Math.max(0, c - 1));
      })
    );
  }

  markAllAsRead(): Observable<any> {
    return this.http.patch(`${API}/notifications/read-all`, {}).pipe(
      tap(() => {
        this.notifications.update(ns => ns.map(n => ({ ...n, isRead: true })));
        this.unreadCount.set(0);
      })
    );
  }

  getIcon(type: string): { icon: string; bg: string; color: string } {
    const map: Record<string, { icon: string; bg: string; color: string }> = {
      // Tipos reales del backend (enum NotificationType) — íconos lucide SVG
      TASK_DUE:         { icon: 'lucideAlarmClock', bg: '#FEF3C7', color: '#D97706' },
      CLASS_REMINDER:   { icon: 'lucideCalendar', bg: '#DBEAFE', color: '#2563EB' },
      ROADMAP_REMINDER: { icon: 'lucideMap', bg: '#EDE9FE', color: '#7C3AED' },
      GROUP_SESSION:    { icon: 'lucideUsers', bg: '#CCFBF1', color: '#0D9488' },
      JOB_MATCH:        { icon: 'lucideBriefcase', bg: '#D1FAE5', color: '#059669' },
      INTERVIEW:        { icon: 'lucideHandshake', bg: '#E0E7FF', color: '#4F46E5' },
      KNOWLEDGE_GAP:    { icon: 'lucideZap', bg: '#F3F4F6', color: '#374151' },
      EXAM_ALERT:       { icon: 'lucideFileText', bg: '#FEE2E2', color: '#DC2626' },
      STREAK_RISK:      { icon: 'lucideFlame', bg: '#FEE2E2', color: '#DC2626' },
      // Alias por compatibilidad
      TASK:         { icon: 'lucideAlarmClock', bg: '#FEF3C7', color: '#D97706' },
      CLASS:        { icon: 'lucideCalendar', bg: '#DBEAFE', color: '#2563EB' },
      JOB:          { icon: 'lucideBriefcase', bg: '#D1FAE5', color: '#059669' },
      GAP:          { icon: 'lucideZap', bg: '#F3F4F6', color: '#374151' },
      STREAK:       { icon: 'lucideFlame', bg: '#FEE2E2', color: '#DC2626' },
      ACHIEVEMENT:  { icon: 'lucideTrophy', bg: '#FEF3C7', color: '#D97706' },
    };
    return map[type] ?? { icon: 'lucideBell', bg: '#EDE9FE', color: '#7C3AED' };
  }

  /**
   * Ruta a la que lleva cada notificación según su tipo y metadata.
   */
  getNotificationLink(n: any): { path: string[] } | null {
    const meta = n?.metadata ?? {};
    switch (n?.type) {
      case 'TASK_DUE':
        if (meta.taskId && meta.subjectId) {
          return { path: ['/subjects', String(meta.subjectId), 'tareas', String(meta.taskId)] };
        }
        return meta.subjectId
          ? { path: ['/subjects', String(meta.subjectId)] }
          : { path: ['/subjects'] };
      case 'CLASS_REMINDER':
        return meta.subjectId
          ? { path: ['/subjects', String(meta.subjectId)] }
          : { path: ['/subjects'] };
      case 'ROADMAP_REMINDER':
        return meta.roadmapId
          ? { path: ['/roadmaps', String(meta.roadmapId)] }
          : { path: ['/roadmaps'] };
      case 'GROUP_SESSION':
        return meta.groupId
          ? { path: ['/grupos', String(meta.groupId)] }
          : { path: ['/grupos'] };
      case 'STREAK_RISK':
      case 'ACHIEVEMENT':
        return { path: ['/perfil'] };
      case 'KNOWLEDGE_GAP':
        return { path: ['/riesgo'] };
      case 'EXAM_ALERT':
        // Intervención IA: plan de recuperación y recursos generados (profesor IA)
        return { path: ['/profesor-ia'] };
      case 'JOB_MATCH':
      case 'INTERVIEW':
        return { path: ['/mi-cv'] };
      default:
        return null;
    }
  }

  // ---------- Actualización en vivo (sondeo HTTP) ----------

  startLive(): void {
    if (this.liveSub || typeof window === 'undefined') return;
    if (!localStorage.getItem('access_token')) return;

    this.liveSub = interval(NOTIFICATIONS_POLL_MS).subscribe(() => this.refresh());
  }

  stopLive(): void {
    this.liveSub?.unsubscribe();
    this.liveSub = undefined;
  }

  private refresh(): void {
    this.getAll().subscribe();
    this.getUnreadCount().subscribe();
  }
}
