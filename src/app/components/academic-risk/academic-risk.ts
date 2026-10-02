import { Component, OnInit, inject, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AcademicRiskService } from '../../services/academic-risk.service';
import { NotificationsService } from '../../services/notifications.service';

interface RiskFactor {
  key: string;
  label: string;
  score: number;
  max: number;
  weight: string;
  detail: string;
  link: string[];
  query?: Record<string, string>;
  pct: number;
}

interface ChartPoint {
  x: number;
  y: number;
  score: number;
  level: string;
}

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-academic-risk',
  standalone: true,
  imports: [CommonModule, DatePipe, SidebarComponent, PageHeaderComponent],
  templateUrl: './academic-risk.html',
  styles: [`:host { display: contents; }`],
})
export class AcademicRiskComponent implements OnInit {
  riskService = inject(AcademicRiskService);
  private notifService = inject(NotificationsService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  activeTab = signal<'resumen' | 'materias' | 'historial'>('resumen');
  intervention = signal<{ plan?: string; tips?: string } | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.riskService.getLatest().subscribe();
    this.riskService.getHistory().subscribe();
    this.riskService.getSubjectsRisk().subscribe();
    this.loadIntervention();
  }

  switchTab(tab: 'resumen' | 'materias' | 'historial'): void {
    this.activeTab.set(tab);
  }

  recalculate(): void {
    this.riskService.recalculate().subscribe({
      next: () => this.riskService.getSubjectsRisk().subscribe(),
    });
  }

  goTo(link: string[], query?: Record<string, string>): void {
    this.router.navigate(link, query ? { queryParams: query } : undefined);
  }

  // ---------- Nivel ----------
  levelLabel(level: string): string {
    if (level === 'LOW') return 'Bajo';
    if (level === 'MEDIUM') return 'Medio';
    return 'Alto';
  }

  getLevelColor(level: string): string {
    if (level === 'LOW') return '#1E9F68';
    if (level === 'MEDIUM') return '#F4B960';
    return '#EF4444';
  }

  getLevelBg(level: string): string {
    if (level === 'LOW') return '#DCFCE7';
    if (level === 'MEDIUM') return '#FEF3C7';
    return '#FEE2E2';
  }

  // ---------- Tendencia ----------
  trend(): { delta: number; up: boolean | null } | null {
    const latest = this.riskService.latest();
    const history = this.riskService.history();
    if (!latest || !history?.length) return null;
    const prev = history[0];
    const delta = latest.score - prev.score;
    if (!delta) return { delta: 0, up: null };
    return { delta, up: delta > 0 };
  }

  // ---------- Factores de riesgo ----------
  getBarPercent(score: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  }

  /** Color propio por factor según su porcentaje, no el color global del riesgo. */
  factorColor(pct: number): string {
    if (pct < 40) return '#1E9F68';
    if (pct < 70) return '#F4B960';
    return '#EF4444';
  }

  getRiskFactors(reasons: any): RiskFactor[] {
    if (!reasons) return [];
    // Filas antiguas guardan `reasons` como array de strings; se reconstruye un
    // desglose aproximado para que la vista no quede vacía hasta recalcular.
    const factors = reasons?.factors ?? this.fallbackFactors(reasons);

    const build = (
      key: string, label: string, max: number, weight: string,
      detail: string, link: string[], query?: Record<string, string>,
    ): RiskFactor => {
      const score = factors[key]?.score ?? 0;
      return {
        key, label, score, max, weight, detail, link, query,
        pct: this.getBarPercent(score, max),
      };
    };

    const list = [
      build('knowledgeGaps', 'Brechas de conocimiento', 30, '30%',
        `${factors.knowledgeGaps?.gapsCount ?? 0} brechas activas`, ['/profesor-ia'], { tab: 'gaps' }),
      build('overdueTasks', 'Tareas vencidas', 25, '25%',
        `${factors.overdueTasks?.overdueCount ?? 0} tareas vencidas`, ['/subjects']),
      build('confidenceIA', 'Confianza IA', 20, '20%',
        `Dominio promedio ${Math.round((factors.confidenceIA?.avgConfidence ?? 0.5) * 100)}%`, ['/profesor-ia'], { tab: 'gaps' }),
      build('roadmaps', 'Progreso de rutas', 15, '15%',
        `Avance ${Math.round((factors.roadmaps?.progress ?? 0) * 100)}% en rutas`, ['/roadmaps']),
      build('engagement', 'Participación', 10, '10%',
        `Actividad reciente ${Math.round((factors.engagement?.engagement ?? 0.5) * 100)}%`, ['/estudio']),
    ];
    // El factor que más aporta al riesgo aparece primero.
    return list.sort((a, b) => b.pct - a.pct);
  }

  private fallbackFactors(reasons: any): Record<string, any> {
    const summary: string[] = Array.isArray(reasons?.summary)
      ? reasons.summary
      : Array.isArray(reasons) ? reasons : [];
    const text = (summary || []).join(' ');
    const count = (pat: RegExp) => {
      const m = pat.exec(text);
      return m ? parseInt(m[1], 10) || 0 : 0;
    };
    return {
      knowledgeGaps: { score: Math.round(Math.min(1, count(/(\d+) gap/) / 10) * 30), max: 30, gapsCount: count(/(\d+) gap/) },
      overdueTasks: { score: Math.round(Math.min(1, count(/(\d+) tarea/) / 5) * 25), max: 25, overdueCount: count(/(\d+) tarea/) },
      confidenceIA: { score: /confianza/.test(text) ? 12 : 8, max: 20, avgConfidence: 0.5 },
      roadmaps: { score: /roadmap/.test(text) ? 8 : 5, max: 15, progress: 0.5 },
      engagement: { score: /actividad/.test(text) ? 6 : 4, max: 10, engagement: 0.5 },
    };
  }

  // ---------- Plan de recuperación IA ----------
  private loadIntervention(): void {
    this.notifService.getAll().subscribe({
      next: (list) => {
        const listArr = Array.isArray(list) ? list : (list?.data ?? []);
        const n = (listArr || []).find((x: any) => x?.type === 'EXAM_ALERT' && x?.metadata?.studyPlan);
        if (n?.metadata) {
          this.intervention.set({ plan: n.metadata.studyPlan, tips: n.metadata.examTips });
        }
      },
    });
  }

  // ---------- Historial / gráfico ----------
  chartDots(): ChartPoint[] {
    const history = this.riskService.history();
    const h = [...(history || [])].reverse();
    if (h.length < 2) return [];
    const w = 100, hh = 40;
    const scores = h.map((x) => x.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = Math.max(1, max - min);
    return h.map((p, i) => ({
      x: (i / (h.length - 1)) * w,
      y: hh - ((p.score - min) / range) * (hh - 6) - 3,
      score: p.score,
      level: p.level,
    }));
  }

  chartPolyline(): string {
    return this.chartDots().map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ');
  }

  chartMin(): number {
    const scores = (this.riskService.history() || []).map((h) => h.score);
    return scores.length ? Math.min(...scores) : 0;
  }

  chartMax(): number {
    const scores = (this.riskService.history() || []).map((h) => h.score);
    return scores.length ? Math.max(...scores) : 0;
  }

  openSubject(subject: any): void {
    this.router.navigate(['/subjects', subject.subjectId]);
  }
}
