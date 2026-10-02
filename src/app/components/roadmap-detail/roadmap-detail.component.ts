import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCheck,
  lucideClock,
  lucideLock,
  lucidePlay,
  lucideWand2,
  lucideX,
  lucideAward,
  lucideChevronRight,
} from '@ng-icons/lucide';
import { RoadmapService, RoadmapStep } from '../../services/roadmap.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

interface LevelView {
  level: number;
  title: string;
  description?: string;
  lessons: RoadmapStep[];
  completedCount: number;
  unlocked: boolean;
}

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-roadmap-detail',
  standalone: true,
  imports: [NgIconComponent, MarkdownPipe, PageHeaderComponent],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCheck,
      lucideClock,
      lucideLock,
      lucidePlay,
      lucideWand2,
      lucideX,
      lucideAward,
      lucideChevronRight,
    }),
  ],
  templateUrl: './roadmap-detail.component.html',
  styleUrl: './roadmap-detail.component.css',
})
export class RoadmapDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected roadmapService = inject(RoadmapService);

  // Quiz state
  protected activeLesson: RoadmapStep | null = null;
  protected qIndex = signal(0);
  protected selected = signal<number | null>(null);
  protected answered = signal(false);
  protected correctCount = signal(0);
  protected quizDone = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.roadmapService.findOne(id).subscribe();
    }
  }

  get rm() {
    return this.roadmapService.selectedRoadmap();
  }

  backToList(): void {
    this.router.navigate(['/roadmaps']);
  }

  // ---------------------------------------------------------------------------
  // Niveles
  // ---------------------------------------------------------------------------

  get levels(): LevelView[] {
    const r = this.rm;
    if (!r) return [];
    const result: LevelView[] = [];
    const total = r.totalLevels || 1;
    for (let lvl = 1; lvl <= total; lvl++) {
      const lessons = r.steps
        .filter((s) => s.level === lvl)
        .sort((a, b) => a.order - b.order);
      const meta = r.levelsMeta?.[lvl - 1];
      result.push({
        level: lvl,
        title: meta?.title || `Nivel ${lvl}`,
        description: meta?.description || undefined,
        lessons,
        completedCount: lessons.filter((s) => s.completed).length,
        unlocked: this.levelUnlocked(lvl),
      });
    }
    return result;
  }

  levelUnlocked(level: number): boolean {
    const r = this.rm;
    if (!r) return false;
    if (level === 1) return true;
    // Los niveles sin lecciones no bloquean el desbloqueo.
    const prev = r.steps.filter((s) => s.level < level);
    return prev.every((s) => s.completed);
  }

  levelDone(level: number): boolean {
    const r = this.rm;
    if (!r) return false;
    const steps = r.steps.filter((s) => s.level === level);
    return steps.length > 0 && steps.every((s) => s.completed);
  }

  completedCount(steps: RoadmapStep[] | undefined): number {
    return steps ? steps.filter((s) => s.completed).length : 0;
  }

  progressPercent(steps: RoadmapStep[] | undefined): number {
    if (!steps || !steps.length) return 0;
    return Math.round((this.completedCount(steps) / steps.length) * 100);
  }

  regenerate(): void {
    const r = this.rm;
    if (!r?.topic || this.roadmapService.generating()) return;
    this.roadmapService
      .generate({ topic: r.topic, regenerate: true })
      .subscribe((newRoadmap) => {
        if (newRoadmap?.id) {
          this.router.navigate(['/roadmaps', newRoadmap.id]);
        }
      });
  }

  // ---------------------------------------------------------------------------
  // Quiz
  // ---------------------------------------------------------------------------

  openLesson(step: RoadmapStep): void {
    // Lecciones sin preguntas: se marcan completadas directamente.
    if (!step.practice?.length) {
      if (!step.completed) this.roadmapService.toggleStep(step.id, true).subscribe();
      return;
    }
    this.activeLesson = step;
    this.qIndex.set(0);
    this.selected.set(null);
    this.answered.set(false);
    this.correctCount.set(0);
    this.quizDone.set(false);
  }

  get currentQuestion() {
    const lesson = this.activeLesson;
    if (!lesson?.practice?.length) return null;
    const raw = lesson.practice[this.qIndex()];
    // Se normaliza correctIndex por si la IA devolvió un índice fuera de rango.
    return {
      ...raw,
      correctIndex: raw.correctIndex % Math.max(1, raw.options?.length || 1),
    };
  }

  optionLetter(i: number): string {
    return String.fromCharCode(65 + i);
  }

  selectOption(i: number): void {
    if (this.answered()) return;
    this.selected.set(i);
    this.answered.set(true);
    const q = this.currentQuestion;
    if (q && i === q.correctIndex) {
      this.correctCount.update((c) => c + 1);
    }
  }

  nextQuestion(): void {
    const lesson = this.activeLesson;
    if (!lesson?.practice) return;
    if (this.qIndex() >= lesson.practice.length - 1) {
      this.quizDone.set(true);
    } else {
      this.qIndex.update((i) => i + 1);
      this.selected.set(null);
      this.answered.set(false);
    }
  }

  finishLesson(): void {
    const lesson = this.activeLesson;
    if (!lesson) return;
    if (!lesson.completed) {
      this.roadmapService.toggleStep(lesson.id, true).subscribe();
    }
    this.activeLesson = null;
  }

  closeQuiz(): void {
    this.activeLesson = null;
  }
}
