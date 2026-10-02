import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AiService, GeneratedResource, QuizQuestion } from '../../services/ai.service';
import { EventBusService } from '../../services/event-bus.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideSparkles,
  lucideClipboardList,
  lucideBookOpen,
  lucideGraduationCap,
  lucideTrash2,
  lucideX,
  lucideCheckCircle2,
  lucideAlertCircle,
  lucideLightbulb,
  lucideTimer,
  lucideFlag,
  lucideChevronLeft,
  lucideChevronRight,
  lucideRotateCcw,
  lucidePlay,
  lucideClock,
  lucideCheckCheck,
} from '@ng-icons/lucide';

/** Pantalla actual del simulacro. */
type Phase = 'idle' | 'exam' | 'results';
type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

@Component({
  selector: 'app-simulacro',
  standalone: true,
  imports: [SidebarComponent, FormsModule, MarkdownPipe, NgIconComponent],
  providers: [
    provideIcons({
      lucideSparkles,
      lucideClipboardList,
      lucideBookOpen,
      lucideGraduationCap,
      lucideTrash2,
      lucideX,
      lucideCheckCircle2,
      lucideAlertCircle,
      lucideLightbulb,
      lucideTimer,
      lucideFlag,
      lucideChevronLeft,
      lucideChevronRight,
      lucideRotateCcw,
      lucidePlay,
      lucideClock,
      lucideCheckCheck,
    }),
  ],
  templateUrl: './simulacro.component.html',
  styles: [
    `
      .quiz-q p,
      .quiz-explain p {
        margin: 0 0 0.5em 0;
      }
      .quiz-q p:last-child,
      .quiz-explain p:last-child {
        margin-bottom: 0;
      }
      .quiz-explain ul,
      .quiz-explain ol {
        margin: 0.25em 0;
        padding-left: 1.5em;
      }
      .quiz-q,
      .quiz-explain,
      .quiz-opt-text {
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .quiz-opt-text p {
        margin: 0;
      }
      .exam-clock {
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class SimulacroComponent implements OnInit, OnDestroy {
  private ai = inject(AiService);
  private events = inject(EventBusService);
  private platformId = inject(PLATFORM_ID);

  /** Temas del chat que nunca sirven como tema de examen. */
  private static readonly GAP_IGNORE = new Set([
    'hola', 'hi', 'hello', 'hey', 'test', 'prueba', 'todo', 'nada', 'caja', 'huevo', 'punto',
    'cosa', 'hacer', 'ejemplo', 'clase', 'tarea', 'video', 'libro', 'buscar', 'escribir',
    'no se', 'sin titulo', 'sin título', 'introduccion', 'introducción', 'concepto', 'tema',
  ]);

  // ---- Configuración del simulacro ----
  // El backend acepta entre 3 y 15 preguntas por simulacro.
  readonly questionOptions = [5, 10, 15];
  readonly durationOptions = [10, 15, 20, 30, 45];
  quizTopicInput = signal('');
  quizDifficulty = signal<Difficulty>('INTERMEDIATE');
  questionCount = signal(10);
  durationMinutes = signal(15);
  selectedGapForQuiz = signal<string | null>(null);
  showAllGaps = signal(false);

  // ---- Datos ----
  quizzes = signal<GeneratedResource[]>([]);
  loadingQuizzes = signal(true);
  generatingQuiz = signal(false);
  quizError = signal<string | null>(null);
  knowledgeGaps = signal<any[]>([]);

  // ---- Examen en curso ----
  phase = signal<Phase>('idle');
  activeQuiz = signal<GeneratedResource | null>(null);
  currentIndex = signal(0);
  answers = signal<Record<number, number>>({});
  flagged = signal<number[]>([]);
  timeLeft = signal(0);
  totalTime = signal(0);

  // ---- Resultados ----
  savingResult = signal(false);
  savedResult = signal(false);
  saveError = signal(false);
  explanations = signal<Record<number, string>>({});
  loadingExplanation = signal<number | null>(null);

  private timerId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadQuizzes();
    this.loadGaps();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  // ---------------------------------------------------------------------------
  // Temas sugeridos (brechas de conocimiento, sin ruido)
  // ---------------------------------------------------------------------------

  /**
   * Temas sugeridos a partir de las brechas detectadas. El detector del backend
   * crea brechas con frases crudas del chat ("hola", "Subject:... example: no se",
   * enlaces, ids...), así que aquí se filtra y se ordena por confianza para que
   * las sugerencias sean realmente útiles.
   */
  get suggestedGaps(): string[] {
    const seen = new Set<string>();
    const topics: string[] = [];
    const candidates = [...this.knowledgeGaps()]
      .map((gap) => ({ topic: String(gap?.topic ?? '').trim(), confidence: Number(gap?.confidence) || 0 }))
      .filter(({ topic }) => this.isUsefulGap(topic))
      .sort((a, b) => b.confidence - a.confidence);

    for (const { topic } of candidates) {
      const key = topic.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      topics.push(topic.length > 40 ? `${topic.slice(0, 37)}...` : topic);
      if (topics.length >= 12) break;
    }
    return topics;
  }

  get visibleGaps(): string[] {
    return this.showAllGaps() ? this.suggestedGaps : this.suggestedGaps.slice(0, 6);
  }

  get hiddenGapsCount(): number {
    return Math.max(0, this.suggestedGaps.length - 6);
  }

  private isUsefulGap(topic: string): boolean {
    if (topic.length < 4 || topic.length > 60) return false;
    if (/[:—…]/.test(topic)) return false;
    if (/^(subject|detected|example|phrase|topic|tema)\b/i.test(topic)) return false;
    if (/(https?:|www\.|\.com|\.co\b)/i.test(topic)) return false;
    if (/[0-9]{4,}/.test(topic)) return false;
    if (!/[a-záéíóúüñ]{3,}/i.test(topic)) return false;
    if (SimulacroComponent.GAP_IGNORE.has(topic.toLowerCase())) return false;
    return true;
  }

  toggleGapForQuiz(topic: string): void {
    this.selectedGapForQuiz.set(this.selectedGapForQuiz() === topic ? null : topic);
    if (this.selectedGapForQuiz()) this.quizTopicInput.set('');
  }

  toggleAllGaps(): void {
    this.showAllGaps.update((value) => !value);
  }

  // ---------------------------------------------------------------------------
  // Listado
  // ---------------------------------------------------------------------------

  private loadQuizzes(): void {
    if (this.quizzes().length === 0) this.loadingQuizzes.set(true);
    // scope=simulacro: aquí solo se listan los exámenes cronometrados.
    this.ai.getResources('QUIZ', true, 'simulacro').subscribe({
      next: (res) => {
        this.quizzes.set(res.resources || []);
        this.loadingQuizzes.set(false);
      },
      error: () => {
        this.loadingQuizzes.set(false);
      },
    });
  }

  private loadGaps(): void {
    this.ai.getKnowledgeGaps().subscribe({
      next: (res) => this.knowledgeGaps.set(res.gaps || []),
    });
  }

  deleteQuiz(id: string | number): void {
    if (!confirm('¿Eliminar este simulacro?')) return;
    const sid = String(id);
    this.ai.deleteResource(sid).subscribe({
      next: () => {
        this.quizzes.set(this.quizzes().filter((quiz) => String(quiz.id) !== sid));
        if (String(this.activeQuiz()?.id) === sid) this.backToList();
        this.events.emit('quiz:deleted');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Crear / arrancar el examen
  // ---------------------------------------------------------------------------

  generateQuiz(): void {
    if (this.generatingQuiz()) return;
    const topic = this.quizTopicInput().trim() || this.selectedGapForQuiz() || undefined;
    this.generatingQuiz.set(true);
    this.quizError.set(null);
    this.ai
      .generateQuiz({ topic, difficulty: this.quizDifficulty(), count: this.questionCount(), origin: 'SIMULACRO' })
      .subscribe({
        next: (res) => {
          this.generatingQuiz.set(false);
          this.quizTopicInput.set('');
          this.selectedGapForQuiz.set(null);
          this.quizzes.update((arr) => [res.resource, ...arr.filter((quiz) => quiz.id !== res.resource.id)]);
          this.beginExam(res.resource);
        },
        error: (err) => {
          this.generatingQuiz.set(false);
          this.quizError.set(err?.error?.error || 'No se pudo generar el simulacro. Inténtalo de nuevo.');
          console.error('[generateQuiz] error:', err);
        },
      });
  }

  /** Abre un simulacro guardado (trae su contenido completo antes de arrancar). */
  startSaved(quiz: GeneratedResource): void {
    this.quizError.set(null);
    if (quiz?.content?.quiz?.length) {
      this.beginExam(quiz);
      return;
    }
    this.ai.getResource(quiz.id).subscribe({
      next: (res) => {
        if (res.resource?.content?.quiz?.length) {
          this.beginExam(res.resource);
        } else {
          this.quizError.set('Este simulacro no tiene preguntas guardadas.');
        }
      },
      error: () => this.quizError.set('No se pudo abrir el simulacro. Revisa tu conexión.'),
    });
  }

  beginExam(quiz: GeneratedResource, durationMinutes?: number): void {
    const questions = quiz?.content?.quiz ?? [];
    if (!questions.length) {
      this.quizError.set('Este simulacro no tiene preguntas guardadas.');
      return;
    }
    const minutes = durationMinutes ?? this.durationMinutes();
    this.activeQuiz.set(quiz);
    this.currentIndex.set(0);
    this.answers.set({});
    this.flagged.set([]);
    this.explanations.set({});
    this.savedResult.set(false);
    this.saveError.set(false);
    this.totalTime.set(minutes * 60);
    this.timeLeft.set(minutes * 60);
    this.phase.set('exam');
    this.startTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    if (!isPlatformBrowser(this.platformId)) return;
    this.timerId = setInterval(() => {
      const next = this.timeLeft() - 1;
      if (next <= 0) {
        this.timeLeft.set(0);
        this.submitExam();
        return;
      }
      this.timeLeft.set(next);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  exitExam(): void {
    if (!confirm('¿Salir del simulacro? Se perderá el progreso de esta intento.')) return;
    this.backToList();
  }

  backToList(): void {
    this.stopTimer();
    this.phase.set('idle');
    this.activeQuiz.set(null);
    this.savedResult.set(false);
    this.saveError.set(false);
  }

  // ---------------------------------------------------------------------------
  // Navegación del examen
  // ---------------------------------------------------------------------------

  get questions(): QuizQuestion[] {
    return this.activeQuiz()?.content?.quiz ?? [];
  }

  get currentQuestion(): QuizQuestion | null {
    return this.questions[this.currentIndex()] ?? null;
  }

  goTo(index: number): void {
    if (index >= 0 && index < this.questions.length) this.currentIndex.set(index);
  }

  next(): void {
    this.goTo(this.currentIndex() + 1);
  }

  prev(): void {
    this.goTo(this.currentIndex() - 1);
  }

  selectAnswer(index: number): void {
    if (this.phase() !== 'exam') return;
    const at = this.currentIndex();
    this.answers.update((answers) => ({ ...answers, [at]: index }));
  }

  toggleFlag(index = this.currentIndex()): void {
    this.flagged.update((list) =>
      list.includes(index) ? list.filter((item) => item !== index) : [...list, index],
    );
  }

  get answeredCount(): number {
    return Object.keys(this.answers()).length;
  }

  get skippedCount(): number {
    return Math.max(0, this.questions.length - this.answeredCount);
  }

  get progressPct(): number {
    const total = this.questions.length;
    return total ? Math.round((this.answeredCount / total) * 100) : 0;
  }

  get timePct(): number {
    const total = this.totalTime();
    return total ? Math.max(0, (this.timeLeft() / total) * 100) : 0;
  }

  get timeCritical(): boolean {
    const total = this.totalTime();
    return this.timeLeft() <= Math.max(30, total * 0.15);
  }

  get timeUsedSeconds(): number {
    return Math.max(0, this.totalTime() - this.timeLeft());
  }

  get remainingLabel(): string {
    return this.formatTime(this.timeLeft());
  }

  get elapsedLabel(): string {
    return this.formatTime(this.timeUsedSeconds);
  }

  get timedOut(): boolean {
    return this.timeLeft() <= 0;
  }

  formatTime(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  letter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  choicesOf(question: QuizQuestion | null): string[] {
    if (!question) return [];
    const raw = question as any;
    if (Array.isArray(raw.choices) && raw.choices.length) {
      return raw.choices.map((choice: any) => String(choice ?? ''));
    }
    if (Array.isArray(raw.options)) {
      return raw.options.map((option: any) =>
        typeof option === 'string' ? option : String(option?.text ?? ''),
      );
    }
    return [];
  }

  correctIndexOf(question: QuizQuestion | null): number {
    if (!question) return -1;
    const choices = this.choicesOf(question);
    const answer = String((question as any).answer ?? '').trim();
    const byText = choices.findIndex((choice) => String(choice).trim() === answer);
    if (byText >= 0) return byText;
    const raw = question as any;
    if (Array.isArray(raw.options)) {
      const byFlag = raw.options.findIndex((option: any) => option?.correct);
      if (byFlag >= 0) return byFlag;
    }
    return -1;
  }

  correctAnswerText(question: QuizQuestion | null): string {
    const index = this.correctIndexOf(question);
    if (index >= 0) return this.choicesOf(question)[index] ?? '';
    return String((question as any)?.answer ?? '');
  }

  userAnswerText(index: number): string {
    const answer = this.answers()[index];
    if (answer === undefined) return 'Sin responder';
    return this.choicesOf(this.questions[index])[answer] ?? 'Sin responder';
  }

  isSkipped(index: number): boolean {
    return this.answers()[index] === undefined;
  }

  isCorrectAnswer(index: number): boolean {
    return this.answers()[index] === this.correctIndexOf(this.questions[index]);
  }

  // ---------------------------------------------------------------------------
  // Resultados
  // ---------------------------------------------------------------------------

  get correctCount(): number {
    return this.questions.reduce(
      (acc, question, index) => (this.isCorrectAnswer(index) ? acc + 1 : acc),
      0,
    );
  }

  get wrongCount(): number {
    return Math.max(0, this.answeredCount - this.correctCount);
  }

  get scoreFraction(): number {
    const total = this.questions.length;
    return total ? this.correctCount / total : 0;
  }

  get scorePct(): number {
    return Math.round(this.scoreFraction * 100);
  }

  get scoreTone(): { color: string; background: string } {
    const score = this.scorePct;
    if (score >= 70) return { color: '#15803d', background: '#dcfce7' };
    if (score >= 40) return { color: '#b45309', background: '#fef3c7' };
    return { color: '#b91c1c', background: '#fee2e2' };
  }

  get resultTitle(): string {
    if (this.timedOut) return '¡Se acabó el tiempo!';
    if (this.scorePct >= 70) return '¡Simulacro aprobado!';
    if (this.scorePct >= 40) return 'Vas por buen camino';
    return 'Toca repasar este tema';
  }

  submitExam(): void {
    if (this.phase() !== 'exam') return;
    this.stopTimer();
    this.phase.set('results');
    this.saveResult();
  }

  private saveResult(): void {
    const quiz = this.activeQuiz();
    if (!quiz) return;
    const correct = this.correctCount;
    const total = this.questions.length;
    const score = this.scoreFraction;

    this.savingResult.set(true);
    this.saveError.set(false);
    this.ai.completeResource(quiz.id, { resultScore: score, resultCorrect: correct, resultTotal: total }).subscribe({
      next: () => {
        this.savingResult.set(false);
        this.savedResult.set(true);
        this.quizzes.update((arr) =>
          arr.map((item) =>
            item.id === quiz.id
              ? {
                  ...item,
                  completed: true,
                  completedAt: new Date().toISOString(),
                  resultScore: score,
                  resultCorrect: correct,
                  resultTotal: total,
                }
              : item,
          ),
        );
        this.events.emit('quiz:completed');
        this.events.emit('gamification:updated');
      },
      error: () => {
        this.savingResult.set(false);
        this.saveError.set(true);
      },
    });
  }

  retrySave(): void {
    if (!this.savingResult()) this.saveResult();
  }

  retakeExam(): void {
    const quiz = this.activeQuiz();
    if (!quiz) return;
    this.beginExam(quiz, Math.max(1, Math.round(this.totalTime() / 60)));
  }

  explainReview(index: number): void {
    if (this.loadingExplanation() !== null) return;
    const question = this.questions[index];
    if (!question) return;

    this.loadingExplanation.set(index);
    const choices = this.choicesOf(question);
    const correctIndex = this.correctIndexOf(question);
    this.ai
      .explainAnswer({
        question: question.question,
        choices,
        correctAnswer: correctIndex >= 0 ? choices[correctIndex] : this.correctAnswerText(question),
        topic: this.activeQuiz()?.content?.topic || this.activeQuiz()?.subject || '',
        isCorrect: this.isCorrectAnswer(index),
      })
      .subscribe({
        next: (res) => {
          this.loadingExplanation.set(null);
          this.explanations.update((map) => ({
            ...map,
            [index]: res.explanation || 'Sin explicación disponible.',
          }));
        },
        error: () => {
          this.loadingExplanation.set(null);
          this.explanations.update((map) => ({
            ...map,
            [index]: 'No se pudo generar la explicación. Inténtalo de nuevo.',
          }));
        },
      });
  }

  /** Para el listado: score guardado en el backend (0-1) → porcentaje. */
  savedScorePct(score: number | null): number {
    if (score == null) return 0;
    return Math.round(score * 100);
  }
}
