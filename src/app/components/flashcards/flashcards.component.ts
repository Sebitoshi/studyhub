import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { PdfUploadComponent } from '../pdf-upload/pdf-upload.component';
import { AiService, Flashcard } from '../../services/ai.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { PlainMathPipe } from '../../pipes/plain-math.pipe';
import { apiErrorMessage } from '../../utils/api-error';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideSparkles,
  lucideBookOpen,
  lucideTrash2,
  lucideX,
  lucideChevronLeft,
  lucideChevronRight,
  lucideLightbulb,
  lucideLayers,
  lucideEye,
  lucideEyeOff,
  lucidePlus,
  lucideShuffle,
} from '@ng-icons/lucide';

/** Mazo de tarjetas agrupadas por tema. */
interface FlashcardDeck {
  topic: string;
  subject: string | null;
  cards: Flashcard[];
  /** Cuántas tarjetas del mazo ya se vieron en la sesión actual. */
  studied: number;
}

/** Nombre del mazo para las tarjetas generadas sin tema. */
const NO_TOPIC = 'Sin tema';
/** Cantidades ofrecidas al generar (el backend acepta de 3 a 20). */
const COUNT_OPTIONS = [5, 10, 15];
/** Página de la pestaña de estudio de un mazo. */
const PAGE_HINT_LIMIT = 160;

@Component({
  selector: 'app-flashcards',
  standalone: true,
  imports: [SidebarComponent, FormsModule, MarkdownPipe, PlainMathPipe, PdfUploadComponent, NgIconComponent],
  providers: [
    provideIcons({
      lucideSparkles,
      lucideBookOpen,
      lucideTrash2,
      lucideX,
      lucideChevronLeft,
      lucideChevronRight,
      lucideLightbulb,
      lucideLayers,
      lucideEye,
      lucideEyeOff,
      lucidePlus,
      lucideShuffle,
    }),
  ],
  templateUrl: './flashcards.component.html',
})
export class FlashcardsComponent implements OnInit {
  private ai = inject(AiService);
  private platformId = inject(PLATFORM_ID);

  readonly countOptions = COUNT_OPTIONS;

  // ---- Datos ----
  flashcards = signal<Flashcard[]>([]);
  loadingFlashcards = signal(true);
  flashcardError = signal<string | null>(null);
  /** Nombre del mazo abierto (null = aún no se elige ninguno). */
  selectedTopic = signal<string | null>(null);
  /** Índice de la tarjeta visible dentro del mazo abierto. */
  cardIndex = signal(0);
  /** Si la respuesta de la tarjeta actual ya se reveló. */
  revealed = signal(false);
  /** Temas que el estudiante ya repasó en esta sesión. */
  private studiedTopics = signal<Record<string, number>>({});

  // ---- Generación por tema ----
  flashcardTopicInput = signal('');
  flashcardCount = signal(10);
  generatingFlashcards = signal(false);

  // ---- Generación desde PDF ----
  generatingFromPdf = signal(false);
  pdfStatus = signal<string | null>(null);
  /** Porcentaje subido del documento (null = aún no empezó). */
  pdfProgress = signal<number | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadFlashcards();
  }

  // ---------------------------------------------------------------------------
  // Datos
  // ---------------------------------------------------------------------------

  private loadFlashcards(keepSelection = false): void {
    if (!keepSelection && this.flashcards().length === 0) this.loadingFlashcards.set(true);
    this.ai.getFlashcards(true).subscribe({
      next: (res) => {
        this.flashcards.set(res.flashcards || []);
        this.loadingFlashcards.set(false);
        this.clampSelection();
      },
      error: () => this.loadingFlashcards.set(false),
    });
  }

  /** Mazos agrupados por tema, del más completo al más pequeño. */
  get decks(): FlashcardDeck[] {
    const byTopic = new Map<string, FlashcardDeck>();
    for (const card of this.flashcards()) {
      const topic = (card.topic || '').trim() || NO_TOPIC;
      const deck = byTopic.get(topic) || {
        topic,
        subject: card.subject || null,
        cards: [],
        studied: 0,
      };
      deck.cards.push(card);
      if (!deck.subject && card.subject) deck.subject = card.subject;
      byTopic.set(topic, deck);
    }
    const studied = this.studiedTopics();
    return [...byTopic.values()]
      .map((deck) => ({ ...deck, studied: studied[deck.topic] || 0 }))
      .sort((a, b) => b.cards.length - a.cards.length || a.topic.localeCompare(b.topic));
  }

  get activeDeck(): FlashcardDeck | null {
    const topic = this.selectedTopic();
    if (!topic) return null;
    return this.decks.find((deck) => deck.topic === topic) || null;
  }

  get activeCards(): Flashcard[] {
    return this.activeDeck?.cards || [];
  }

  get currentCard(): Flashcard | null {
    return this.activeCards[this.cardIndex()] ?? null;
  }

  get totalCards(): number {
    return this.flashcards().length;
  }

  /** Texto que se muestra mientras se sube/procesa el documento. */
  get pdfBusyLabel(): string {
    const percent = this.pdfProgress();
    if (percent === null || percent >= 100) return 'Leyendo tus apuntes…';
    return `Subiendo ${percent}%…`;
  }

  /** Materia del mazo, ocultando el genérico "general" que asigna el backend. */
  deckSubject(deck: FlashcardDeck): string {
    const subject = (deck.subject || '').trim();
    return !subject || subject.toLowerCase() === 'general' ? '' : subject;
  }

  get hiddenAnswerHint(): string {
    const hint = this.currentCard?.hint;
    if (!hint) return 'Toca la tarjeta para ver la respuesta.';
    return hint.length > PAGE_HINT_LIMIT ? `${hint.slice(0, PAGE_HINT_LIMIT - 3)}...` : hint;
  }

  get progressPct(): number {
    const total = this.activeCards.length;
    return total ? Math.round(((this.cardIndex() + 1) / total) * 100) : 0;
  }

  // ---------------------------------------------------------------------------
  // Selección y navegación
  // ---------------------------------------------------------------------------

  selectTopic(topic: string): void {
    if (this.selectedTopic() === topic) return;
    this.selectedTopic.set(topic);
    this.cardIndex.set(0);
    this.revealed.set(false);
  }

  nextCard(): void {
    const total = this.activeCards.length;
    if (!total) return;
    this.cardIndex.update((index) => (index + 1) % total);
    this.revealed.set(false);
  }

  prevCard(): void {
    const total = this.activeCards.length;
    if (!total) return;
    this.cardIndex.update((index) => (index - 1 + total) % total);
    this.revealed.set(false);
  }

  goToCard(index: number): void {
    if (index < 0 || index >= this.activeCards.length) return;
    this.cardIndex.set(index);
    this.revealed.set(false);
  }

  toggleReveal(): void {
    const revealing = !this.revealed();
    this.revealed.set(revealing);
    if (revealing) {
      const topic = this.selectedTopic();
      if (topic) {
        this.studiedTopics.update((map) => ({ ...map, [topic]: Math.max(map[topic] || 0, this.cardIndex() + 1) }));
      }
    }
  }

  /** Baraja el mazo abierto para no memorizar por posición. */
  shuffleDeck(): void {
    const topic = this.selectedTopic();
    if (!topic) return;
    this.flashcards.update((cards) => {
      const shuffled = this.shuffle(cards.filter((card) => ((card.topic || '').trim() || NO_TOPIC) === topic));
      let cursor = 0;
      return cards.map((card) => (((card.topic || '').trim() || NO_TOPIC) === topic ? shuffled[cursor++] : card));
    });
    this.cardIndex.set(0);
    this.revealed.set(false);
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  private clampSelection(): void {
    const decks = this.decks;
    if (!decks.length) {
      this.selectedTopic.set(null);
      this.cardIndex.set(0);
      this.revealed.set(false);
      return;
    }
    const current = this.selectedTopic();
    if (!current || !decks.some((deck) => deck.topic === current)) {
      this.selectedTopic.set(decks[0].topic);
      this.cardIndex.set(0);
      this.revealed.set(false);
      return;
    }
    const size = decks.find((deck) => deck.topic === current)?.cards.length || 0;
    if (this.cardIndex() >= size) this.cardIndex.set(0);
  }

  // ---------------------------------------------------------------------------
  // Generación
  // ---------------------------------------------------------------------------

  generateFlashcards(): void {
    if (this.generatingFlashcards()) return;
    const topic = this.flashcardTopicInput().trim() || undefined;
    this.generatingFlashcards.set(true);
    this.flashcardError.set(null);
    this.pdfStatus.set(null);

    this.ai.generateFlashcards({ topic, count: this.flashcardCount() }).subscribe({
      next: (res) => {
        this.generatingFlashcards.set(false);
        const created = res.flashcards || [];
        if (!created.length) {
          this.flashcardError.set('La IA no devolvió tarjetas. Prueba con otro tema.');
          return;
        }
        this.flashcardTopicInput.set('');
        this.flashcards.update((cards) => [...created, ...cards]);
        this.selectTopic(this.topicOf(created[0]) ?? NO_TOPIC);
      },
      error: (err) => {
        this.generatingFlashcards.set(false);
        this.flashcardError.set(apiErrorMessage(err, 'Error al generar las flashcards'));
      },
    });
  }

  /** Genera tarjetas extra para el mazo abierto (para que un tema tenga varias). */
  generateMoreForActiveTopic(count: number): void {
    const topic = this.selectedTopic();
    if (!topic || topic === NO_TOPIC || this.generatingFlashcards()) return;
    this.generatingFlashcards.set(true);
    this.flashcardError.set(null);
    this.ai.generateFlashcards({ topic, count }).subscribe({
      next: (res) => {
        this.generatingFlashcards.set(false);
        const created = res.flashcards || [];
        if (!created.length) return;
        this.flashcards.update((cards) => [...created, ...cards]);
        this.cardIndex.set(0);
        this.revealed.set(false);
      },
      error: (err) => {
        this.generatingFlashcards.set(false);
        this.flashcardError.set(apiErrorMessage(err, 'No se pudieron generar más tarjetas'));
      },
    });
  }

  /** Genera flashcards a partir del documento subido (PDF/DOCX/TXT). */
  onPdfSelected(file: File): void {
    if (this.generatingFromPdf()) return;
    this.generatingFromPdf.set(true);
    this.flashcardError.set(null);
    this.pdfProgress.set(0);
    this.pdfStatus.set(`Subiendo "${file.name}"…`);

    this.ai.generateFlashcardsFromFile(file, { count: 15 }, (percent) => {
      this.pdfProgress.set(percent);
      if (percent >= 100) this.pdfStatus.set('Leyendo tus apuntes y creando las tarjetas…');
    }).subscribe({
      next: (res) => {
        this.generatingFromPdf.set(false);
        this.pdfProgress.set(null);
        const created = res.flashcards || [];
        if (!created.length) {
          this.pdfStatus.set(null);
          this.flashcardError.set('No pudimos crear tarjetas con ese documento.');
          return;
        }
        this.flashcards.update((cards) => [...created, ...cards]);
        this.selectTopic(this.topicOf(created[0]) ?? NO_TOPIC);
        this.pdfStatus.set(`Listo: ${created.length} tarjetas nuevas a partir de "${file.name}".`);
      },
      error: (err) => {
        this.generatingFromPdf.set(false);
        this.pdfProgress.set(null);
        this.pdfStatus.set(null);
        this.flashcardError.set(apiErrorMessage(err, 'No pudimos leer ese documento. Prueba con otro PDF.'));
      },
    });
  }

  private topicOf(card: Flashcard | undefined): string | null {
    const topic = (card?.topic || '').trim();
    return topic || null;
  }

  // ---------------------------------------------------------------------------
  // Eliminar
  // ---------------------------------------------------------------------------

  deleteCurrentCard(): void {
    const card = this.currentCard;
    if (!card) return;
    if (!confirm('¿Eliminar esta flashcard?')) return;
    const id = String(card.id);
    this.ai.deleteResource(id).subscribe({
      next: () => {
        this.flashcards.update((cards) => cards.filter((item) => String(item.id) !== id));
        this.cardIndex.set(0);
        this.revealed.set(false);
        this.clampSelection();
      },
    });
  }

  deleteDeck(topic: string): void {
    const deck = this.decks.find((item) => item.topic === topic);
    if (!deck) return;
    if (!confirm(`¿Eliminar las ${deck.cards.length} tarjetas de "${topic}"?`)) return;
    for (const card of deck.cards) {
      this.ai.deleteResource(String(card.id)).subscribe({
        next: () => {
          this.flashcards.update((cards) => cards.filter((item) => String(item.id) !== String(card.id)));
        },
      });
    }
    this.cardIndex.set(0);
    this.revealed.set(false);
    if (this.selectedTopic() === topic) this.selectedTopic.set(null);
  }
}
