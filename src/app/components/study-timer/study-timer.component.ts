import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideBarChart3,
  lucideBell,
  lucideBookOpen,
  lucideBrain,
  lucideCalendarDays,
  lucideCheck,
  lucideClock,
  lucideHistory,
  lucidePause,
  lucidePlay,
  lucidePlus,
  lucideRotateCcw,
  lucideTimer,
  lucideTrash2,
  lucideZap,
} from '@ng-icons/lucide';
import { RouterLink } from '@angular/router';
import { StudyTimerService, StudySessionRecord, StudyTechnique, STUDY_TECHNIQUES } from '../../services/study-timer.service';
import { SubjectsService, SubjectSummary } from '../../services/subjects.service';
import { EventBusService } from '../../services/event-bus.service';
import { SidebarComponent } from '../sidebar/sidebar.component';

interface PersistedTimer {
  startedAt: number;
  elapsedBase: number;
  technique: string;
  subjectId: number | null;
}

const STORAGE_KEY = 'studyhub_study_timer';
const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-study-timer',
  standalone: true,
  imports: [CommonModule, SidebarComponent, NgIconComponent, RouterLink, PageHeaderComponent],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideBarChart3,
      lucideBell,
      lucideBookOpen,
      lucideBrain,
      lucideCalendarDays,
      lucideCheck,
      lucideClock,
      lucideHistory,
      lucidePause,
      lucidePlay,
      lucidePlus,
      lucideRotateCcw,
      lucideTimer,
      lucideTrash2,
      lucideZap,
    }),
  ],
  templateUrl: './study-timer.component.html',
})
export class StudyTimerComponent implements OnInit, OnDestroy {
  private timerService = inject(StudyTimerService);
  private subjectsService = inject(SubjectsService);
  private events = inject(EventBusService);

  statsHours = signal('0.0');
  statsLoading = signal(true);
  subjects = signal<SubjectSummary[]>([]);
  subjectsLoading = signal(true);
  sessions = signal<StudySessionRecord[]>([]);
  // Sesiones de la semana (independientes del filtro): alimentan el gráfico semanal.
  weekSessions = signal<StudySessionRecord[]>([]);
  historyPeriod = signal<'day' | 'week' | 'month' | 'all'>('all');
  historyTotal = signal(0);
  historyPage = signal(1);
  historyLoading = signal(false);
  historyLoadingMore = signal(false);

  readonly historyPeriods: { id: 'day' | 'week' | 'month' | 'all'; label: string }[] = [
    { id: 'day', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'all', label: 'Todo' },
  ];

  selectedSubject = signal<number | null>(null);
  selectedTechnique = signal('POMODORO_25_5');

  timeLeft = signal(25 * 60);
  isRunning = signal(false);
  isSaving = signal(false);

  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  readonly techniques: StudyTechnique[] = STUDY_TECHNIQUES;

  readonly ringCircumference = RING_CIRCUMFERENCE;

  private timerInterval: any;
  private toastTimeout: any;
  private audioCtx: AudioContext | null = null;
  private elapsedBase = 0;
  private startedAt: number | null = null;
  private totalSeconds = 25 * 60;

  ngOnInit() {
    this.restoreTimer();
    this.loadStats();
    this.loadSubjects();
    this.loadHistory();
    this.loadWeekSessions();
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    clearTimeout(this.toastTimeout);
    // Si el timer está en curso, su estado queda persistido en localStorage:
    // la sesión no se pierde al navegar a otra sección.
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private loadHistory(page: number = 1) {
    this.historyLoading.set(true);
    this.timerService.getSessions(this.historyPeriod(), page).subscribe({
      next: (pg) => {
        this.sessions.set(pg.records);
        this.historyTotal.set(pg.total);
        this.historyPage.set(pg.page);
        this.historyLoading.set(false);
      },
      error: () => this.historyLoading.set(false),
    });
  }

  /** Carga las sesiones de la semana (sin filtro) para el gráfico, una sola vez. */
  private loadWeekSessions(): void {
    this.timerService.getSessions('week', 1, 50).subscribe({
      next: (pg) => this.weekSessions.set(pg.records),
      error: () => this.weekSessions.set([]),
    });
  }

  selectPeriod(period: 'day' | 'week' | 'month' | 'all'): void {
    if (this.historyPeriod() === period) return;
    this.historyPeriod.set(period);
    this.loadHistory(1);
  }

  loadMoreHistory(): void {
    if (this.historyLoadingMore()) return;
    const nextPage = this.historyPage() + 1;
    if (this.sessions().length >= this.historyTotal()) return;
    this.historyLoadingMore.set(true);
    this.timerService.getSessions(this.historyPeriod(), nextPage).subscribe({
      next: (pg) => {
        // Evita duplicados si el usuario repite el scroll mientras carga.
        const existing = new Set(this.sessions().map((s) => s.id));
        const fresh = pg.records.filter((r) => !existing.has(r.id));
        this.sessions.set([...this.sessions(), ...fresh]);
        this.historyTotal.set(pg.total);
        this.historyPage.set(pg.page);
        this.historyLoadingMore.set(false);
      },
      error: () => this.historyLoadingMore.set(false),
    });
  }

  private loadStats() {
    this.timerService.getStats().subscribe({
      next: (res) => {
        this.statsHours.set(res.totalHours);
        this.statsLoading.set(false);
      },
      error: () => this.statsLoading.set(false),
    });
  }

  private loadSubjects() {
    this.subjectsService.getSubjects().subscribe({
      next: (res) => {
        this.subjects.set(res);
        this.subjectsLoading.set(false);
      },
      error: () => this.subjectsLoading.set(false),
    });
  }

  // ---------------------------------------------------------------------------
  // Timer state (elapsed-time based, so stats are never inflated)
  // ---------------------------------------------------------------------------

  get currentTech(): StudyTechnique {
    return this.techniques.find((t) => t.id === this.selectedTechnique())!;
  }

  get selectedSubjectName(): string {
    const id = this.selectedSubject();
    if (id === null) return '';
    return this.subjects().find((s) => s.id === id)?.nombre ?? '';
  }

  get elapsedSeconds(): number {
    const running = this.startedAt !== null ? (Date.now() - this.startedAt) / 1000 : 0;
    return Math.max(0, this.elapsedBase + running);
  }

  get formatTime(): string {
    const s = Math.max(0, Math.floor(this.timeLeft()));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  get ringProgress(): number {
    if (this.totalSeconds <= 0) return 0;
    return Math.min(1, Math.max(0, this.timeLeft() / this.totalSeconds));
  }

  get ringDashOffset(): number {
    return RING_CIRCUMFERENCE * (1 - this.ringProgress);
  }

  get canFinish(): boolean {
    return this.elapsedSeconds > 0 && !this.isSaving();
  }

  selectTechnique(techId: string) {
    if (this.isRunning() || this.isSaving()) return;
    this.selectedTechnique.set(techId);
    this.resetState();
  }

  toggleTimer() {
    if (this.isSaving()) return;
    this.isRunning() ? this.pauseTimer() : this.startTimer();
  }

  resetTimer() {
    if (this.isSaving()) return;
    clearInterval(this.timerInterval);
    this.isRunning.set(false);
    this.resetState();
  }

  private startTimer() {
    if (this.isSaving()) return;
    this.startedAt = Date.now();
    this.isRunning.set(true);
    this.persistTimer();
    this.timerInterval = setInterval(() => this.tick(), 1000);
    this.tick();
    // Aquí (gesto del usuario) se crea/desbloquea el AudioContext para
    // cumplir con la política de autoplay y se pide permiso de notificación.
    this.getAudioContext();
    void this.requestNotificationPermission();
  }

  private pauseTimer() {
    if (this.startedAt !== null) {
      this.elapsedBase += (Date.now() - this.startedAt) / 1000;
    }
    this.startedAt = null;
    this.isRunning.set(false);
    clearInterval(this.timerInterval);
    this.clearPersisted();
    this.timeLeft.set(Math.max(0, Math.round(this.totalSeconds - this.elapsedSeconds)));
  }

  private tick() {
    if (this.startedAt === null) return;
    const endAt = this.startedAt + (this.totalSeconds - this.elapsedBase) * 1000;
    const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    this.timeLeft.set(remaining);
    if (remaining <= 0) {
      // Se detiene el intervalo para evitar reintentos automáticos (y spam de
      // toasts) si el guardado falla; el usuario puede reintentar manualmente.
      clearInterval(this.timerInterval);
      this.isRunning.set(false);
      this.finishSession();
    }
  }

  finishSession() {
    if (this.isSaving()) return;
    if (this.elapsedSeconds <= 0) {
      this.showToast('Aún no hay tiempo de estudio para guardar.', 'error');
      return;
    }

    // Nunca se reporta más de la duración real de la técnica: si la pestaña
    // estuvo en segundo plano o se restaura un timer viejo, la sesión no se infla.
    const durationMinutes = Math.min(
      this.currentTech.minutes,
      Math.max(1, Math.round(this.elapsedSeconds / 60))
    );
    this.isSaving.set(true);

    this.timerService
      .saveSession({
        subjectId: this.selectedSubject() ?? undefined,
        durationMinutes,
        technique: this.selectedTechnique(),
      })
      .subscribe({
        next: (res) => {
          this.isSaving.set(false);
          this.showToast(`¡Sesión completada! Ganaste ${res.xpEarned} XP`, 'success');
          this.playCompletionSound();
          this.showBrowserNotification(res.xpEarned);
          this.events.emit('gamification:updated');
          this.loadStats();
          this.recordSession(res.xpEarned, durationMinutes);
          this.resetState();
        },
        error: () => {
          this.isSaving.set(false);
          this.showToast('No se pudo guardar la sesión. Inténtalo de nuevo.', 'error');
        },
      });
  }

  private resetState() {
    clearInterval(this.timerInterval);
    this.elapsedBase = 0;
    this.startedAt = null;
    this.totalSeconds = this.currentTech.minutes * 60;
    this.timeLeft.set(this.totalSeconds);
    this.clearPersisted();
  }

  // ---------------------------------------------------------------------------
  // Persistence: the running session survives navigation
  // ---------------------------------------------------------------------------

  private persistTimer() {
    if (this.startedAt === null || typeof localStorage === 'undefined') return;
    try {
      const data: PersistedTimer = {
        startedAt: this.startedAt,
        elapsedBase: this.elapsedBase,
        technique: this.selectedTechnique(),
        subjectId: this.selectedSubject(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  private clearPersisted() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  private restoreTimer() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as PersistedTimer;
      if (
        !data ||
        !Number.isFinite(data.startedAt) ||
        !Number.isFinite(data.elapsedBase) ||
        data.elapsedBase < 0
      ) {
        this.clearPersisted();
        return;
      }
      const tech = this.techniques.find((t) => t.id === data.technique);
      if (!tech) {
        this.clearPersisted();
        return;
      }
      this.selectedTechnique.set(tech.id);
      this.selectedSubject.set(data.subjectId ?? null);
      this.totalSeconds = tech.minutes * 60;
      this.elapsedBase = data.elapsedBase;
      this.startedAt = data.startedAt;
      this.isRunning.set(true);
      this.timerInterval = setInterval(() => this.tick(), 1000);
      this.tick();
    } catch {
      this.clearPersisted();
    }
  }

  // ---------------------------------------------------------------------------
  // Session history (local)
  // ---------------------------------------------------------------------------

  private recordSession(xpEarned: number, durationMinutes: number) {
    const record: StudySessionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      date: new Date().toISOString(),
      durationMinutes,
      technique: this.selectedTechnique(),
      subjectId: this.selectedSubject(),
      xpEarned,
    };
    this.timerService.addHistoryRecord(record);
    this.events.emit('study:session');
    // Recarga desde el backend para sincronizar total/página del periodo actual y el gráfico.
    this.loadHistory(1);
    this.loadWeekSessions();
  }

  clearHistory() {
    this.timerService.clearHistory().subscribe({
      next: (res) => {
        this.sessions.set([]);
        this.showToast(
          res.xpReverted > 0
            ? `Historial borrado. Se revirtieron ${res.xpReverted} XP.`
            : 'Historial borrado.',
          'success'
        );
        // Refresca nivel/XP del sidebar y del dashboard.
        this.events.emit('gamification:updated');
      },
      error: () => this.showToast('No se pudo borrar el historial. Inténtalo de nuevo.', 'error'),
    });
  }

  techniqueName(id: string): string {
    return this.techniques.find((t) => t.id === id)?.name ?? 'Sesión de estudio';
  }

  techniqueColor(id: string): string {
    return this.techniques.find((t) => t.id === id)?.color ?? '#64748b';
  }

  techniqueIcon(id: string): string {
    return this.techniques.find((t) => t.id === id)?.icon ?? 'lucideClock';
  }

  subjectName(id: number | null): string {
    if (id === null) return '';
    return this.subjects().find((s) => s.id === id)?.nombre ?? '';
  }

  formatMinutes(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  private dateLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfDay) / 86400000);
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== today.getFullYear()) options.year = 'numeric';
    return d.toLocaleDateString('es-ES', options);
  }

  timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  get groupedSessions(): { label: string; items: StudySessionRecord[] }[] {
    const map = new Map<string, StudySessionRecord[]>();
    for (const s of this.sessions()) {
      const label = this.dateLabel(s.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(s);
    }
    return Array.from(map, ([label, items]) => ({ label, items }));
  }

  get weekBars(): { label: string; minutes: number; pct: number; isToday: boolean }[] {
    const byDay = new Map<string, number>();
    for (const s of this.weekSessions()) {
      const d = new Date(s.date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      byDay.set(key, (byDay.get(key) ?? 0) + s.durationMinutes);
    }

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const bars: { label: string; minutes: number; pct: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      bars.push({
        label: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
        minutes: byDay.get(key) ?? 0,
        pct: 0,
        isToday: key === todayKey,
      });
    }
    const max = Math.max(...bars.map((b) => b.minutes), 1);
    for (const b of bars) {
      b.pct = b.minutes > 0 ? Math.max(8, Math.round((b.minutes / max) * 100)) : 0;
    }
    return bars;
  }

  get weekStats(): { sessions: number; minutes: number; xp: number } {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let sessions = 0;
    let minutes = 0;
    let xp = 0;
    for (const s of this.weekSessions()) {
      if (new Date(s.date).getTime() >= weekAgo) {
        sessions++;
        minutes += s.durationMinutes;
        xp += s.xpEarned;
      }
    }
    return { sessions, minutes, xp };
  }

  get totalSessions(): number {
    return this.historyTotal();
  }

  get totalMinutes(): number {
    return this.sessions().reduce((acc, s) => acc + s.durationMinutes, 0);
  }

  get totalXp(): number {
    return this.sessions().reduce((acc, s) => acc + s.xpEarned, 0);
  }

  // ---------------------------------------------------------------------------
  // End-of-session alerts: chime (Web Audio) + browser notification
  // ---------------------------------------------------------------------------

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.audioCtx) this.audioCtx = new Ctor();
    // El AudioContext se crea/reanuda dentro de un gesto del usuario
    // (inicio de sesión) para cumplir con la política de autoplay.
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
  }

  private playCompletionSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 · E5 · G5 (acorde mayor)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.18;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  }

  private async requestNotificationPermission(): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    try {
      await Notification.requestPermission();
    } catch {
      /* permiso no disponible o rechazado */
    }
  }

  private showBrowserNotification(xp: number) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification('¡Sesión de estudio completada!', {
        body: `Terminaste tu sesión y ganaste ${xp} XP. ¡Sigue así!`,
        tag: 'study-session-complete',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* algunos navegadores requieren service worker para notificaciones */
    }
  }

  // ---------------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------------

  private showToast(message: string, type: 'success' | 'error') {
    clearTimeout(this.toastTimeout);
    this.toast.set({ message, type });
    this.toastTimeout = setTimeout(() => this.toast.set(null), 4000);
  }
}
