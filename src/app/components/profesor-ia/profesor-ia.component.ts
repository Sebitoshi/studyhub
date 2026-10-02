import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, ElementRef, OnInit, ViewChild, inject, PLATFORM_ID, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import {
  lucideMessageCircle, lucideBrain, lucideCrosshair, lucidePlus,
  lucideRuler, lucideTerminal, lucideSendHorizontal, lucideTrash2,
  lucideCalendar, lucideGraduationCap, lucideCalculator, lucideCode,
  lucideLanguages, lucidePen, lucideBot, lucideLoader,
  lucideChevronLeft, lucideChevronRight,
  lucideClipboardList, lucideSparkles, lucideRefreshCw, lucideTrophy,
  lucideCheckCircle2, lucideXCircle, lucideLightbulb, lucideInfo,
} from '@ng-icons/lucide';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';import { AiService, TeacherProfile, Conversation, Message, KnowledgeGap, LearningGoal,
  GeneratedResource, QuizQuestion, Flashcard, 
} from '../../services/ai.service';

@Component({
  selector: 'app-profesor-ia',
  standalone: true,
  imports: [SidebarComponent, RouterLink, NgIconComponent, FormsModule, DatePipe, MarkdownPipe],
  providers: [provideIcons({
    lucideMessageCircle, lucideBrain, lucideCrosshair, lucidePlus,
    lucideRuler, lucideTerminal, lucideSendHorizontal, lucideTrash2,
    lucideCalendar, lucideGraduationCap, lucideCalculator, lucideCode,
    lucideLanguages, lucidePen, lucideBot, lucideLoader,
    lucideChevronLeft, lucideChevronRight,
    lucideClipboardList, lucideSparkles, lucideRefreshCw, lucideTrophy,
    lucideCheckCircle2, lucideXCircle, lucideLightbulb, lucideInfo,
  })],
  templateUrl: './profesor-ia.component.html',
  styles: [`:host { display: block; height: 100dvh; min-height: 0; overflow: hidden; }
    .chat-msg p { margin: 0 0 0.5em 0; }
    .chat-msg p:last-child { margin-bottom: 0; }
    .chat-msg ul, .chat-msg ol { margin: 0.25em 0; padding-left: 1.5em; }
    .chat-msg li { margin-bottom: 0.15em; }
    .chat-msg strong { font-weight: 700; }
    .chat-msg em { font-style: italic; }
    .chat-msg br { display: block; content: ''; margin: 0.25em 0; }
    .quiz-q p { margin: 0 0 0.5em 0; }
    .quiz-q p:last-child { margin-bottom: 0; }
    .quiz-q strong { font-weight: 700; }
    .quiz-q em { font-style: italic; }
    .quiz-q ul, .quiz-q ol { margin: 0.25em 0; padding-left: 1.5em; }
    .quiz-q .katex { font-size: 1.05em; }
    .quiz-opt .katex { font-size: 1.05em; }
    .quiz-opt { line-height: 1.55; }
    .quiz-opt p { margin: 0; }
    .quiz-opt-text { min-width: 0; }
  `],
})
export class ProfesorIaComponent implements OnInit {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('teacherChips') teacherChips!: ElementRef<HTMLDivElement>;
  protected ai = inject(AiService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  activeTab = signal<'chat' | 'gaps' | 'metas' | 'quiz' | 'flashcards'>('chat');

  // ---- Flashcards ----
  flashcardTopicInput = signal('');
  generatingFlashcards = signal(false);
  flashcardError = signal<string | null>(null);

  teacherProfiles = signal<TeacherProfile[]>([]);
  selectedTeacher = signal<TeacherProfile | null>(null);

  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  conversations = signal<Conversation[]>([]);
  selectedConversationId = signal<string | null>(null);
  messages = signal<Message[]>([]);

  messageInput = signal('');
  sending = signal(false);

  loadingChat = signal(true);
  loadingMessages = signal(false);

  knowledgeGaps = signal<KnowledgeGap[]>([]);
  loadingGaps = signal(true);

  goals = signal<LearningGoal[]>([]);
  loadingGoals = signal(true);

  newGoal = signal<{ title: string; description: string; targetDate: string }>({
    title: '', description: '', targetDate: '',
  });
  showNewGoalForm = signal(false);
  creatingGoal = signal(false);

  // ---- Flashcards ----
  flashcards = signal<Flashcard[]>([]);
  loadingFlashcards = signal(true);
  selectedFlashcard = signal<string | null>(null);

  // ---- Quiz ----
  quizzes = signal<GeneratedResource[]>([]);
  loadingQuizzes = signal(true);
  generatingQuiz = signal(false);
  quizTopicInput = signal('');
  selectedGapForQuiz = signal<string | null>(null);
  quizDifficulty = signal<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('INTERMEDIATE');
  quizError = signal<string | null>(null);

  activeQuiz = signal<GeneratedResource | null>(null);
  quizQIndex = signal(0);
  quizSelected = signal<number | null>(null);
  quizAnswered = signal(false);
  quizCorrectCount = signal(0);
  quizDone = signal(false);
  savingQuizResult = signal(false);
  quizExplaining = signal(false);
  quizExplainText = signal('');
  showQuizExplainModal = signal(false);

  showNewTeacherForm = signal(false);
  newTeacherProfile = signal<{ name: string; description: string; subjects: string; systemPrompt: string; teachingStyle: string; difficultyLevel: string }>({
    name: '', description: '', subjects: '', systemPrompt: '', teachingStyle: 'balanced', difficultyLevel: 'intermediate',
  });

  user = signal<any>(null);

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('user');
      this.user.set(raw ? JSON.parse(raw) : null);
    }
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Deep link: /profesor-ia?tab=chat|gaps|metas|quiz|flashcards
    this.route.queryParamMap.subscribe((params) => this.applyTabFromQuery(params.get('tab')));

    this.loadChatData();
    this.loadGaps();
    this.loadGoals();
    this.loadQuizzes();
    this.loadFlashcards();
  }

  switchTab(tab: 'chat' | 'gaps' | 'metas' | 'quiz' | 'flashcards') {
    this.activeTab.set(tab);
    // Mantiene la URL sincronizada con la pestaña para que los enlaces deep
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });
    if (tab === 'quiz' && !this.generatingQuiz()) {
      this.loadQuizzes();
    }
    if (tab === 'flashcards' && this.flashcards().length === 0) {
      this.loadFlashcards();
    }
  }

  /** Aplica la pestaña indicada por la URL (?tab=...); sin parámetro vuelve al chat. */
  private applyTabFromQuery(tab: string | null): void {
    const target = tab === 'gaps' || tab === 'metas' || tab === 'quiz' || tab === 'flashcards' ? tab : 'chat';
    if (this.activeTab() === target) return;

    this.activeTab.set(target as any);
    if (target === 'quiz' && !this.generatingQuiz()) {
      this.loadQuizzes();
    }
    if (target === 'flashcards' && !this.loadingFlashcards()) {
      this.loadFlashcards();
    }
  }

  activeRouteSidebar(): string {
    // Quiz vive dentro del chat de IA; Simulacro y Flashcards son páginas aparte.
    return this.activeTab() === 'flashcards' ? 'flashcards' : 'profesor-ia';
  }

  private loadChatData(): void {
    this.loadingChat.set(true);
    this.ai.getTeacherProfiles().subscribe({
      next: (res) => {
        this.teacherProfiles.set(res.profiles);
        if (res.profiles.length > 0) {
          const general = res.profiles.find(p => p.code === 'GENERAL_TEACHER');
          this.selectedTeacher.set(general || res.profiles[0]);
        }
        setTimeout(() => this.updateTeacherScrollState(), 0);
      },
      error: () => {
        this.loadingChat.set(false);
      },
    });
    this.ai.getConversations().subscribe({
      next: (res) => {
        this.conversations.set(res.conversations);
        this.loadingChat.set(false);
        setTimeout(() => this.updateTeacherScrollState(), 50);
        if (this.conversations().length > 0) {
          this.selectConversation(this.conversations()[0]._id);
        } else {
          this.newConversation();
        }
      },
      error: () => {
        this.loadingChat.set(false);
      },
    });
  }

  selectConversation(id: string): void {
    this.selectedConversationId.set(id);
    this.loadingMessages.set(true);
    this.messages.set([]);
    this.ai.getConversation(id).subscribe({
      next: (res) => {
        this.messages.set(res.messages || []);
        this.loadingMessages.set(false);
        setTimeout(() => this.scrollToBottom(true), 50);
      },
      error: () => {
        this.loadingMessages.set(false);
      },
    });
  }

  newConversation(): void {
    this.sending.set(true);
    this.ai.createConversation().subscribe({
      next: (conv) => {
        this.conversations.update(arr => [conv, ...arr]);
        this.selectedConversationId.set(conv._id);
        this.messages.set([]);
        this.sending.set(false);
      },
      error: () => {
        this.sending.set(false);
      },
    });
  }

  deleteConversation(id: string, event: Event): void {
    event.stopPropagation();
    this.ai.deleteConversation(id).subscribe({
      next: () => {
        this.conversations.update(arr => arr.filter(c => c._id !== id));
        if (this.selectedConversationId() === id) {
          this.selectedConversationId.set(null);
          this.messages.set([]);
          if (this.conversations().length > 0) {
            this.selectConversation(this.conversations()[0]._id);
          }
        }
      },
    });
  }

  selectTeacher(profile: TeacherProfile, event?: Event): void {
    this.selectedTeacher.set(profile);
    const chip = (event?.target as HTMLElement | undefined)?.closest('span');
    chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  scrollTeachers(direction: 1 | -1): void {
    const el = this.teacherChips?.nativeElement;
    if (!el) return;
    if (direction < 0 && !this.canScrollLeft()) return;
    if (direction > 0 && !this.canScrollRight()) return;
    el.scrollBy({ left: direction * 240, behavior: 'smooth' });
  }

  updateTeacherScrollState(): void {
    const el = this.teacherChips?.nativeElement;
    if (!el) {
      this.canScrollLeft.set(false);
      this.canScrollRight.set(false);
      return;
    }
    this.canScrollLeft.set(el.scrollLeft > 4);
    this.canScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  sendMessage(): void {
    const text = this.messageInput().trim();
    if (!text || this.sending()) return;
    this.messageInput.set('');

    const userMsg: Message = {
      _id: 'temp-' + Date.now(),
      conversationId: this.selectedConversationId() || '',
      userId: 0,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    this.messages.update(arr => [...arr, userMsg]);
    this.sending.set(true);
    setTimeout(() => this.scrollToBottom(true), 50);

    // Se usa el endpoint directo POST /ai/chat, que devuelve la respuesta completa
    // en una sola llamada JSON (sin streaming).
    this.ai.sendMessage(
      text,
      this.selectedConversationId() || undefined,
      this.selectedTeacher()?.code || undefined,
    ).subscribe({
      next: (res) => {
        const assistantMsg: Message = {
          _id: 'resp-' + Date.now(),
          conversationId: res.conversationId || this.selectedConversationId() || '',
          userId: 0,
          role: 'assistant',
          content: res.reply,
          createdAt: new Date().toISOString(),
        };
        this.messages.update(arr => [...arr, assistantMsg]);
        if (!this.selectedConversationId() && res.conversationId) {
          this.selectedConversationId.set(res.conversationId);
        }
        this.sending.set(false);
        this.refreshConversations();
        setTimeout(() => this.scrollToBottom(true), 50);
      },
      error: () => {
        this.sending.set(false);
        this.messages.update(arr => [...arr, {
          _id: 'err-' + Date.now(),
          conversationId: this.selectedConversationId() || '',
          userId: 0,
          role: 'assistant' as const,
          content: 'No se pudo obtener respuesta del profesor IA. Revisa tu conexión e inténtalo de nuevo.',
          createdAt: new Date().toISOString(),
        }]);
        setTimeout(() => this.scrollToBottom(true), 50);
      },
    });
  }

  private scrollToBottom(force = false): void {
    const el = this.messagesContainer?.nativeElement;
    if (!el) return;
    if (force) {
      el.scrollTop = el.scrollHeight;
    } else {
      const threshold = 60;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      if (isNearBottom) el.scrollTop = el.scrollHeight;
    }
  }

  private refreshConversations(): void {
    this.ai.getConversations().subscribe({
      next: (res) => {
        this.conversations.set(res.conversations);
      },
    });
  }

  // ---- Knowledge Gaps ----
  private loadGaps(): void {
    this.loadingGaps.set(true);
    this.ai.getKnowledgeGaps().subscribe({
      next: (res) => {
        this.knowledgeGaps.set(res.gaps);
        this.loadingGaps.set(false);
      },
      error: () => {
        this.loadingGaps.set(false);
      },
    });
  }

  updateGapStatus(gap: KnowledgeGap, status: string): void {
    this.ai.updateKnowledgeGap(gap._id, { status }).subscribe({
      next: (res) => {
        this.knowledgeGaps.update(arr => {
          const idx = arr.findIndex(g => g._id === gap._id);
          if (idx >= 0) {
            const copy = [...arr];
            copy[idx] = res.gap;
            return copy;
          }
          return arr;
        });
      },
    });
  }

  // ---- Goals ----
  private loadGoals(): void {
    this.loadingGoals.set(true);
    this.ai.getGoals().subscribe({
      next: (res) => {
        this.goals.set(res.goals);
        this.loadingGoals.set(false);
      },
      error: () => {
        this.loadingGoals.set(false);
      },
    });
  }

  private loadFlashcards(): void {
    this.loadingFlashcards.set(true);
    this.ai.getFlashcards().subscribe({
      next: (res) => {
        this.flashcards.set(res.flashcards || []);
        this.loadingFlashcards.set(false);
      },
      error: () => {
        this.loadingFlashcards.set(false);
      },
    });
  }

  createGoal(): void {
    if (!this.newGoal().title.trim() || this.creatingGoal()) return;
    this.creatingGoal.set(true);
    this.ai.createGoal({
      title: this.newGoal().title,
      description: this.newGoal().description || undefined,
      targetDate: this.newGoal().targetDate || undefined,
    }).subscribe({
      next: (res) => {
        this.goals.update(arr => [res.goal, ...arr]);
        this.newGoal.set({ title: '', description: '', targetDate: '' });
        this.showNewGoalForm.set(false);
        this.creatingGoal.set(false);
      },
      error: () => {
        this.creatingGoal.set(false);
      },
    });
  }

  generateFlashcards(): void {
    if (this.generatingFlashcards()) return;
    this.generatingFlashcards.set(true);
    this.flashcardError.set(null);
    this.ai.generateFlashcards({
      topic: this.flashcardTopicInput().trim() || undefined,
    }).subscribe({
      next: (res) => {
        this.generatingFlashcards.set(false);
        this.flashcardTopicInput.set('');
        this.flashcards.update(arr => (res.flashcards ? [...res.flashcards, ...arr] : arr));
        this.flashcardError.set(null);
      },
      error: (err) => {
        this.generatingFlashcards.set(false);
        this.flashcardError.set('No se pudieron generar las Flashcards. Inténtalo de nuevo.');
        console.error('[generateFlashcards] error:', err);
      },
    });
  }

  selectFlashcard(id: string): void {
    this.selectedFlashcard.set(String(id));
  }

  private get selectedFc(): Flashcard | null {
    return this.flashcards().find(f => String(f.id) === this.selectedFlashcard()) || null;
  }

  get flashcardQuestionPreview(): string {
    return this.selectedFc?.question || '';
  }

  get flashcardHint(): string | null {
    return this.selectedFc?.hint ?? null;
  }

  get flashcardAnswer(): string {
    return this.selectedFc?.answer ?? '';
  }

  deleteFlashcard(id: string): void {
    const sid = String(id);
    if (!confirm('¿Eliminar esta flashcard?')) return;
    this.ai.deleteResource(sid).subscribe({
      next: () => {
        this.flashcards.update(arr => arr.filter(f => String(f.id) !== sid));
        if (this.selectedFlashcard() === sid) this.selectedFlashcard.set(null);
      },
    });
  }

  createTeacherProfile(): void {
    const data = this.newTeacherProfile();
    if (!data.name.trim()) return;
    this.ai.createTeacherProfile({
      name: data.name,
      description: data.description,
      subjects: data.subjects.split(',').map(s => s.trim()).filter(Boolean),
      systemPrompt: data.systemPrompt,
      teachingStyle: data.teachingStyle,
      difficultyLevel: data.difficultyLevel,
      active: true,
    }).subscribe({
      next: (res) => {
        this.teacherProfiles.update(arr => [...arr, res.profile]);
        this.newTeacherProfile.set({ name: '', description: '', subjects: '', systemPrompt: '', teachingStyle: 'balanced', difficultyLevel: 'intermediate' });
        this.showNewTeacherForm.set(false);
        setTimeout(() => this.updateTeacherScrollState(), 0);
      },
    });
  }

  updateGoalProgress(goal: LearningGoal, event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.ai.updateGoal(goal._id, { progress: value }).subscribe({
      next: (res) => {
        this.goals.update(arr => {
          const idx = arr.findIndex(g => g._id === goal._id);
          if (idx >= 0) {
            const copy = [...arr];
            copy[idx] = res.goal;
            return copy;
          }
          return arr;
        });
      },
      error: (err) => {
        console.error('[updateGoalProgress] error:', err);
      },
    });
  }

  deleteGoal(id: string): void {
    this.ai.deleteGoal(id).subscribe({
      next: () => {
        this.goals.update(arr => arr.filter(g => g._id !== id));
      },
    });
  }

  // ---- Quiz ----
  private loadQuizzes(): void {
    if (this.quizzes().length === 0) this.loadingQuizzes.set(true);
    // scope=quiz: la pestaña Quiz no lista los simulacros (esos viven en su página).
    this.ai.getResources('QUIZ', true, 'quiz').subscribe({
      next: (res) => {
        this.quizzes.set(res.resources || []);
        this.loadingQuizzes.set(false);
      },
      error: () => {
        this.loadingQuizzes.set(false);
      },
    });
  }

  toggleGapForQuiz(topic: string): void {
    this.selectedGapForQuiz.set(this.selectedGapForQuiz() === topic ? null : topic);
    if (this.selectedGapForQuiz()) this.quizTopicInput.set('');
  }

  generateQuiz(): void {
    if (this.generatingQuiz()) return;
    this.quizError.set(null);
    const topic = this.quizTopicInput().trim() || this.selectedGapForQuiz() || undefined;
    this.generatingQuiz.set(true);
    this.ai.generateQuiz({ topic, difficulty: this.quizDifficulty() }).subscribe({
      next: (res) => {
        this.generatingQuiz.set(false);
        this.quizTopicInput.set('');
        this.selectedGapForQuiz.set(null);
        this.quizzes.update(arr => [res.resource, ...arr.filter(q => q.id !== res.resource.id)]);
        this.openQuiz(res.resource);
      },
      error: (err) => {
        this.generatingQuiz.set(false);
        this.quizError.set('No se pudo generar el quiz. Inténtalo de nuevo.');
        console.error('[generateQuiz] error:', err);
      },
    });
  }

  get quizQuestions(): QuizQuestion[] {
    return this.activeQuiz()?.content?.quiz || [];
  }

  get currentQuizQuestion(): QuizQuestion | null {
    return this.quizQuestions[this.quizQIndex()] ?? null;
  }

  get quizCorrectIndex(): number | null {
    const q = this.currentQuizQuestion;
    if (!q) return null;
    // Normaliza con trim para tolerar espacios extra que pueda devolver la IA.
    const answer = (q.answer || '').trim();
    const idx = (q.choices || []).findIndex(c => (c || '').trim() === answer);
    return idx >= 0 ? idx : null;
  }

  quizOptionLetter(i: number): string {
    return String.fromCharCode(65 + i);
  }

  openQuiz(quiz: GeneratedResource): void {
    if (quiz?.content?.quiz?.length) {
      this.startQuiz(quiz);
      return;
    }
    // Los quizzes del listado vienen sin `content` (el endpoint de lista no lo
    // incluye): se trae el recurso completo antes de abrir el reproductor.
    this.ai.getResource(quiz.id).subscribe({
      next: (res) => {
        if (res.resource?.content?.quiz?.length) this.startQuiz(res.resource);
      },
      error: () => {
        /* sin contenido no se puede abrir; se deja la lista como está */
      },
    });
  }

  private startQuiz(quiz: GeneratedResource): void {
    this.activeQuiz.set(quiz);
    this.quizQIndex.set(0);
    this.quizSelected.set(null);
    this.quizAnswered.set(false);
    this.quizCorrectCount.set(0);
    this.quizDone.set(false);
    this.savingQuizResult.set(false);
  }

  selectQuizOption(i: number): void {
    if (this.quizAnswered()) return;
    this.quizSelected.set(i);
    this.quizAnswered.set(true);
    if (i === this.quizCorrectIndex) {
      this.quizCorrectCount.update(c => c + 1);
    }
  }

  nextQuizQuestion(): void {
    if (this.quizQIndex() >= this.quizQuestions.length - 1) {
      this.quizDone.set(true);
    } else {
      this.quizQIndex.update(i => i + 1);
      this.quizSelected.set(null);
      this.quizAnswered.set(false);
    }
  }

  retakeQuiz(): void {
    const quiz = this.activeQuiz();
    if (quiz) this.openQuiz(quiz);
  }

  closeQuiz(): void {
    this.activeQuiz.set(null);
  }

  explainQuizAnswer(): void {
    const q = this.currentQuizQuestion;
    if (!q || this.quizExplaining()) return;
    this.quizExplaining.set(true);
    this.quizExplainText.set('');
    const choices = q.choices || [];
    this.ai.explainAnswer({
      question: q.question,
      choices,
      correctAnswer: q.answer || '',
      topic: this.activeQuiz()?.content?.topic || this.activeQuiz()?.subject || '',
      isCorrect: this.quizSelected() === this.quizCorrectIndex,
    }).subscribe({
      next: (res) => {
        this.quizExplainText.set(res.explanation || 'Sin explicación disponible.');
        this.quizExplaining.set(false);
        this.showQuizExplainModal.set(true);
      },
      error: () => {
        const fallback = q.explanation || `La respuesta correcta es: **${q.answer || 'N/A'}**. La explicación detallada estará disponible cuando el backend se actualice.`;
        this.quizExplainText.set(fallback);
        this.quizExplaining.set(false);
        this.showQuizExplainModal.set(true);
      },
    });
  }

  finishQuiz(): void {
    const quiz = this.activeQuiz();
    if (!quiz || this.savingQuizResult()) return;
    this.savingQuizResult.set(true);
    const total = this.quizQuestions.length;
    const score = total ? this.quizCorrectCount() / total : 0;
    this.ai.completeResource(quiz.id, {
      resultScore: score,
      resultCorrect: this.quizCorrectCount(),
      resultTotal: total,
    }).subscribe({
      next: () => {
        this.quizzes.update(arr => arr.map(q =>
          q.id === quiz.id ? {
            ...q,
            completed: true,
            completedAt: new Date().toISOString(),
            resultScore: score,
            resultCorrect: this.quizCorrectCount(),
            resultTotal: total,
          } : q
        ));
        this.savingQuizResult.set(false);
        this.activeQuiz.set(null);
      },
      error: () => {
        this.savingQuizResult.set(false);
        this.activeQuiz.set(null);
      },
    });
  }

  deleteQuiz(id: string): void {
    this.ai.deleteResource(id).subscribe({
      next: () => {
        this.quizzes.update(arr => arr.filter(q => q.id !== id));
      },
    });
  }

  quizPercent(score: number | null): number {
    if (score == null) return 0;
    return Math.round(score * 100);
  }
}
