import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen, lucideClock, lucideCheckCircle, lucideFlame,
  lucideAlarmClock, lucideCalendar, lucideMap, lucideUsers, lucideBriefcase,
  lucideHandshake, lucideZap, lucideFileText, lucideTrophy, lucideBell,
  lucideChevronRight, lucideTimer, lucideBrain, lucideEye, lucideEyeOff,
  lucideGripVertical, lucideTrendingUp, lucideSettings2,
} from '@ng-icons/lucide';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { AuthService } from '../../services/auth.service';
import { DashboardService, DashboardData, LeaderboardData, LeaderboardEntry } from '../../services/dashboard.service';
import { EventBusService } from '../../services/event-bus.service';
import { CalendarService, CalendarEvent } from '../../services/calendar.service';
import { NotificationsService } from '../../services/notifications.service';
import { StudyTimerService, StudySessionRecord, STUDY_TECHNIQUES } from '../../services/study-timer.service';
import { resolveMediaUrl } from '../../utils/media-url';

interface TaskItem {
  id: number;
  title: string;
  subjectId: number;
  subject: string | null;
  subjectColor: string | null;
  label: string;
  badgeClass: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [SidebarComponent, DatePipe, NgIconComponent, RouterLink, DragDropModule],
  providers: [provideIcons({
    lucideBookOpen, lucideClock, lucideCheckCircle, lucideFlame,
    lucideAlarmClock, lucideCalendar, lucideMap, lucideUsers, lucideBriefcase,
    lucideHandshake, lucideZap, lucideFileText, lucideTrophy, lucideBell,
    lucideChevronRight, lucideTimer, lucideBrain, lucideEye, lucideEyeOff,
    lucideGripVertical, lucideTrendingUp, lucideSettings2,
  })],
  templateUrl: './dashboard.component.html',
  styles: [`:host { display: contents; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  protected auth = inject(AuthService);
  protected notifService = inject(NotificationsService);
  private router = inject(Router);
  private dashboard = inject(DashboardService);
  private events = inject(EventBusService);
  private calendar = inject(CalendarService);
  private studyTimer = inject(StudyTimerService);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private unsubscribers: (() => void)[] = [];
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;

  // Notificaciones (panel flotante)
  notifPanelOpen = false;
  notifPanelPos = { top: 0, left: 0 };
  @ViewChild('notifPanel') notifPanelEl?: ElementRef<HTMLElement>;

  data: DashboardData = {
    user: null, stats: { subjects: 0, pendingTasks: 0, completedTasks: 0, notes: 0 },
    gamification: { level: 1, xp: 0, totalXp: 0, xpForNextLevel: 500, streak: 0, achievements: 0 },
    academicRisk: null, activeGoals: [], upcomingClasses: [], upcomingTasks: [], recentNotes: [],
    completionRate: 0,
  };
  loading = true;
  errorMsg = '';
  today: Date = new Date();
  tasks: TaskItem[] = [];
  riskBarClass = 'bg-gray-200';
  upcomingExams: CalendarEvent[] = [];
  recentSessions: StudySessionRecord[] = [];
  leaderboard: LeaderboardData | null = null;
  leaderboardTab: 'streak' | 'hours' = 'streak';
  leaderboardLoading = true;

  // ── Widgets personalizables ──
  private static readonly WIDGET_STORAGE = 'studyhub_dashboard_widgets';
  private static readonly DEFAULT_ROWS = [
    { row: 'stats', ids: ['stats', 'progreso'] },
    { row: 'main', ids: ['clases', 'riesgo'] },
    { row: 'tasks', ids: ['tareas', 'examenes', 'metas'] },
    { row: 'social', ids: ['ranking', 'sesiones'] },
    { row: 'notes', ids: ['notas'] },
  ];
  widgetRows: { row: string; ids: string[] }[] = DashboardComponent.DEFAULT_ROWS.map(r => ({ ...r, ids: [...r.ids] }));
  widgetVisible: Record<string, boolean> = {};
  customizing = false;

  // ── Gráficos y contadores ──
  allSessions: StudySessionRecord[] = [];
  counters: Record<string, number> = {};
  private countersAnimated = false;

  ngOnInit(): void {
    this.loadWidgetPrefs();
    this.loadData();
    this.loadRecentSessions();
    this.loadLeaderboard();

    if (isPlatformBrowser(this.platformId)) {
      this.notifService.getAll().subscribe();
      this.notifService.getUnreadCount().subscribe();
      this.notifService.startLive();
    }

    // Escuchar eventos de cambios y recargar
    const eventTypes = [
      'subject:created', 'subject:deleted',
      'task:created', 'task:toggled', 'task:updated', 'task:deleted',
      'note:created', 'note:deleted',
      'event:created', 'event:updated', 'event:deleted',
      'gamification:updated',
      'profile:updated',
      'goal:created', 'goal:updated', 'goal:deleted',
    ] as const;

    for (const type of eventTypes) {
      this.unsubscribers.push(
        this.events.on(type, () => this.loadData(true))
      );
    }

    // Una sesión de estudio registrada refresca solo el historial local.
    this.unsubscribers.push(
      this.events.on('study:session', () => this.loadRecentSessions())
    );

    // Actualiza la fecha y los datos dependientes del día automáticamente a medianoche.
    this.scheduleMidnightRefresh();
  }

  ngOnDestroy(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }
    this.unsubscribers.forEach(unsub => unsub());
    this.closeNotifPanel();
    this.notifService.stopLive();
  }

  /**
   * Programa un timeout para la próxima medianoche local. Al dispararse, actualiza
   * la fecha mostrada y refresca los datos que dependen del día (clases de hoy,
   * tareas, exámenes, ranking) sin recargar la página, y se reprograma para el día
   * siguiente.
   */
  private scheduleMidnightRefresh(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0); // próxima medianoche local
    const delay = Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000);

    this.midnightTimer = setTimeout(() => {
      this.today = new Date();
      this.cdr.markForCheck();
      // El día cambió: recarga lo que depende de la fecha.
      this.loadData(true);
      this.loadRecentSessions();
      this.loadLeaderboard();
      this.scheduleMidnightRefresh();
    }, delay);
  }

  private loadData(forceRefresh = false): void {
    this.dashboard.getSummary(forceRefresh).subscribe({
      next: (res) => {
        this.data = res;
        this.tasks = this.buildTasks(res);
        this.riskBarClass = this.computeRiskClass(res);
        this.loading = false;
        this.animateCounters();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Error al cargar el dashboard. ¿El servidor está corriendo?';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });

    if (isPlatformBrowser(this.platformId)) {
      this.calendar.getUpcomingExams().subscribe({
        next: (exams) => {
          this.upcomingExams = exams;
          this.cdr.markForCheck();
        },
      });
    }
  }

  get user() {
    if (!isPlatformBrowser(this.platformId)) return null;
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }

  private buildTasks(res: DashboardData): TaskItem[] {
    return (res.upcomingTasks || []).map((t) => {
      const label = this.daysUntil(t.dueDate);
      return {
        id: t.id,
        title: t.title,
        subjectId: t.subjectId,
        subject: t.subject,
        subjectColor: t.subjectColor,
        label,
        badgeClass: this.taskBadgeClass(label),
      };
    });
  }

  private daysUntil(dueDate: string): string {
    const now = new Date();
    const due = new Date(dueDate);
    const diff = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Hoy';
    if (diff === 1) return '1d';
    if (diff < 0) return 'Vencida';
    return `${diff}d`;
  }

  private taskBadgeClass(days: string): string {
    if (days === 'Hoy') return 'bg-red-100 text-red-700';
    if (days === '1d') return 'bg-pink-100 text-pink-700';
    if (days === 'Vencida') return 'bg-gray-100 text-gray-700';
    const num = parseInt(days);
    if (num <= 3) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-500';
  }

  private loadRecentSessions(): void {
    // getSessions ya hace fallback a la caché local en caso de error.
    this.studyTimer.getSessions().subscribe((pg) => {
      this.allSessions = pg.records || [];
      this.recentSessions = this.allSessions.slice(0, 5);
      this.cdr.markForCheck();
    });
  }

  private loadLeaderboard(): void {
    this.leaderboardLoading = true;
    this.dashboard.getLeaderboard().subscribe({
      next: (data) => {
        this.leaderboard = data;
        this.leaderboardLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.leaderboard = null;
        this.leaderboardLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  switchLeaderboardTab(tab: 'streak' | 'hours'): void {
    this.leaderboardTab = tab;
  }

  leaderboardEntries(): LeaderboardEntry[] {
    if (!this.leaderboard) return [];
    return this.leaderboardTab === 'streak' ? this.leaderboard.byStreak : this.leaderboard.byHours;
  }

  leaderboardMetric(entry: LeaderboardEntry): string {
    if (this.leaderboardTab === 'streak') {
      const days = entry.currentStreak ?? 0;
      return `${days} ${days === 1 ? 'día' : 'días'}`;
    }
    const totalHours = ((entry.totalMinutes ?? 0) / 60).toFixed(1);
    return `${totalHours} h`;
  }

  leaderboardSub(entry: LeaderboardEntry): string {
    if (this.leaderboardTab === 'streak') {
      return `Récord: ${entry.bestStreak ?? 0} días`;
    }
    const h = Math.floor((entry.totalMinutes ?? 0) / 60);
    const m = (entry.totalMinutes ?? 0) % 60;
    return h > 0 ? `${h} h ${m} min totales` : `${m} min totales`;
  }

  myRank(): number | null {
    if (!this.leaderboard) return null;
    return this.leaderboardTab === 'streak'
      ? this.leaderboard.me.rankByStreak
      : this.leaderboard.me.rankByHours;
  }

  initials(name: string | null | undefined): string {
    const parts = (name || '').trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';
  }

  avatarFor(entry: LeaderboardEntry): string | null {
    return resolveMediaUrl(entry.foto);
  }

  techName(id: string): string {
    return STUDY_TECHNIQUES.find((t) => t.id === id)?.name ?? 'Sesión de estudio';
  }

  techColor(id: string): string {
    return STUDY_TECHNIQUES.find((t) => t.id === id)?.color ?? '#64748b';
  }

  techIcon(id: string): string {
    return STUDY_TECHNIQUES.find((t) => t.id === id)?.icon ?? 'lucideClock';
  }

  fmtMinutes(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  sessionTimeLabel(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  private computeRiskClass(res: DashboardData): string {
    const score = res.academicRisk?.score ?? 0;
    if (score < 40) return 'bg-green-500';
    if (score < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  examDaysUntil(date: string): string {
    const now = new Date();
    const d = new Date(date);
    const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff < 0) return 'Vencido';
    return `En ${diff} días`;
  }

  examBadgeClass(days: string): string {
    if (days === 'Hoy') return 'bg-red-100 text-red-700';
    if (days === 'Mañana') return 'bg-pink-100 text-pink-700';
    if (days === 'Vencido') return 'bg-gray-100 text-gray-500';
    const num = parseInt(days.replace('En ', '').replace(' días', ''));
    if (num <= 3) return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-600';
  }

  // ---------- Notificaciones (panel flotante) ----------

  toggleNotifPanel(btn: HTMLElement): void {
    if (this.notifPanelOpen) {
      this.closeNotifPanel();
    } else {
      this.openNotifPanel(btn);
    }
  }

  private openNotifPanel(btn: HTMLElement): void {
    if (typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const panelW = Math.min(380, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - panelW, window.innerWidth - panelW - 8));
    this.notifPanelPos = { top: rect.bottom + 10, left };
    this.notifPanelOpen = true;
    window.addEventListener('scroll', this.onWindowScroll, true);
    window.addEventListener('keydown', this.onKeydown);
  }

  closeNotifPanel(): void {
    if (!this.notifPanelOpen) return;
    this.notifPanelOpen = false;
    window.removeEventListener('scroll', this.onWindowScroll, true);
    window.removeEventListener('keydown', this.onKeydown);
  }

  markOneNotif(id: number): void {
    this.notifService.markAsRead(id).subscribe();
  }

  markAllNotifs(): void {
    this.notifService.markAllAsRead().subscribe();
  }

  openNotification(n: any): void {
    if (!n?.isRead) this.markOneNotif(n.id);
    this.closeNotifPanel();
    const link = this.notifService.getNotificationLink(n);
    if (link) this.router.navigate(link.path);
  }

  openTask(task: TaskItem): void {
    if (!task?.subjectId) return;
    this.router.navigate(['/subjects', task.subjectId, 'tareas', task.id]);
  }

  private onWindowScroll = (e: Event): void => {
    // Ignorar scroll dentro del propio panel (lista de notificaciones)
    if (this.notifPanelEl?.nativeElement.contains(e.target as Node)) return;
    this.closeNotifPanel();
  };

  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.closeNotifPanel();
  };

  // ───────────── Widgets personalizables ─────────────
  private loadWidgetPrefs(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(DashboardComponent.WIDGET_STORAGE) || 'null');
      const known = new Set(DashboardComponent.DEFAULT_ROWS.flatMap(r => r.ids));
      const byRow = new Map<string, string[]>((saved?.rows || []).map((r: any) => [
        r?.row,
        (Array.isArray(r?.ids) ? r.ids : []).filter((id: string) => known.has(id)),
      ]));
      // Se reconstruyen las filas: usa lo guardado (sanitizado) o el orden por defecto.
      this.widgetRows = DashboardComponent.DEFAULT_ROWS.map(r => {
        const savedIds = byRow.get(r.row);
        return { row: r.row, ids: savedIds && savedIds.length ? savedIds : [...r.ids] };
      });
      if (saved?.visible && typeof saved.visible === 'object') {
        this.widgetVisible = { ...saved.visible };
      }
    } catch {
      /* preferencias corruptas: usar valores por defecto */
    }
  }

  private persistWidgetPrefs(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DashboardComponent.WIDGET_STORAGE, JSON.stringify({
      rows: this.widgetRows,
      visible: this.widgetVisible,
    }));
  }

  widgetIsVisible(id: string): boolean {
    return this.widgetVisible[id] !== false;
  }

  widgetRow(rowId: string): string[] {
    return this.widgetRows.find(r => r.row === rowId)?.ids ?? [];
  }

  widgetTitle(id: string): string {
    const map: Record<string, string> = {
      stats: 'Resumen', progreso: 'Tu progreso', clases: 'Clases de hoy', riesgo: 'Riesgo académico',
      tareas: 'Tareas próximas', examenes: 'Exámenes y eventos', metas: 'Metas activas',
      ranking: 'Ranking', sesiones: 'Sesiones de estudio', notas: 'Notas recientes',
    };
    return map[id] ?? id;
  }

  toggleWidget(id: string): void {
    this.widgetVisible[id] = this.widgetVisible[id] === false ? true : false;
    this.persistWidgetPrefs();
  }

  onWidgetDrop(event: CdkDragDrop<string[]>, rowId: string): void {
    const row = this.widgetRows.find(r => r.row === rowId);
    if (!row) return;
    // CDK calcula los índices entre los widgets VISIBLES; se reordena el subconjunto
    // visible y se reconstruye la fila conservando los ocultos en su lugar relativo.
    const visible = row.ids.filter(id => this.widgetIsVisible(id));
    moveItemInArray(visible, event.previousIndex, event.currentIndex);
    const newIds: string[] = [];
    let vi = 0;
    for (const id of row.ids) {
      newIds.push(this.widgetIsVisible(id) ? visible[vi++] : id);
    }
    row.ids = newIds;
    this.persistWidgetPrefs();
  }

  resetWidgets(): void {
    this.widgetRows = DashboardComponent.DEFAULT_ROWS.map(r => ({ ...r, ids: [...r.ids] }));
    this.widgetVisible = {};
    this.persistWidgetPrefs();
  }

  // ───────────── Contadores animados ─────────────
  private animateCounters(): void {
    if (this.countersAnimated || typeof requestAnimationFrame === 'undefined') return;
    this.countersAnimated = true;
    const targets: Record<string, number> = {
      subjects: this.data.stats?.subjects ?? 0,
      pending: this.data.stats?.pendingTasks ?? 0,
      completed: this.data.stats?.completedTasks ?? 0,
      streak: this.data.gamification?.streak ?? 0,
    };
    const start = performance.now();
    const dur = 900;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      for (const [key, target] of Object.entries(targets)) {
        this.counters[key] = Math.round(target * eased);
      }
      this.cdr.markForCheck();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ───────────── Gráficos ─────────────
  xpProgress(): number {
    const g = this.data.gamification;
    const xpForNext = g?.xpForNextLevel ?? 500;
    const xp = g?.xp ?? 0;
    return xpForNext > 0 ? Math.min(100, Math.round((xp / xpForNext) * 100)) : 0;
  }

  donutCircumference(): number {
    return 2 * Math.PI * 42;
  }

  donutOffset(): number {
    return this.donutCircumference() * (1 - this.xpProgress() / 100);
  }

  weeklyHours(): { label: string; minutes: number; isToday: boolean; max: number }[] {
    const byDay = new Map<string, number>();
    for (const s of this.allSessions) {
      if (!s?.date) continue;
      const d = new Date(s.date);
      const key = d.toDateString();
      byDay.set(key, (byDay.get(key) || 0) + (s.durationMinutes || 0));
    }
    const days: { label: string; minutes: number; isToday: boolean; max: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const minutes = byDay.get(d.toDateString()) || 0;
      const label = i === 0
        ? 'Hoy'
        : d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').slice(0, 3);
      days.push({ label, minutes, isToday: i === 0, max: 0 });
    }
    const max = Math.max(1, ...days.map(dd => dd.minutes));
    return days.map(dd => ({ ...dd, max }));
  }

  weeklyTotalMinutes(): number {
    return this.weeklyHours().reduce((acc, d) => acc + d.minutes, 0);
  }

  fmtWeekly(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  barHeight(minutes: number, max: number): number {
    return max > 0 ? Math.max(4, Math.round((minutes / max) * 100)) : 4;
  }
}
