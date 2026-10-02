import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AiService, Flashcard } from '../../services/ai.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { lucideSparkles, lucideBookOpen, lucideTrash2, lucideX } from '@ng-icons/lucide';

@Component({
  selector: 'app-flashcards',
  standalone: true,
  imports: [SidebarComponent, FormsModule, MarkdownPipe, NgIconComponent],
  providers: [provideIcons({ lucideSparkles, lucideBookOpen, lucideTrash2, lucideX })],
  templateUrl: './flashcards.component.html',
})
export class FlashcardsComponent implements OnInit {
  private ai = inject(AiService);
  private platformId = inject(PLATFORM_ID);

  flashcards = signal<Flashcard[]>([]);
  loadingFlashcards = signal(true);
  generatingFlashcards = signal(false);
  flashcardError = signal<string | null>(null);
  flashcardTopicInput = signal('');
  selectedFlashcard = signal<string | null>(null);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadFlashcards();
  }

  private loadFlashcards(): void {
    this.loadingFlashcards.set(true);
    this.ai.getFlashcards().subscribe({
      next: (res) => {
        this.flashcards.set(res.flashcards || []);
        this.loadingFlashcards.set(false);
        if (res.flashcards && res.flashcards.length > 0 && this.selectedFlashcard() === null) {
          this.selectedFlashcard.set(String(res.flashcards[0].id));
        }
      },
      error: () => {
        this.loadingFlashcards.set(false);
      },
    });
  }

  generateFlashcards(): void {
    if (this.generatingFlashcards()) return;
    const topic = this.flashcardTopicInput().trim() || undefined;
    this.generatingFlashcards.set(true);
    this.flashcardError.set(null);
    this.ai.generateFlashcards({ topic }).subscribe({
      next: (res) => {
        this.generatingFlashcards.set(false);
        this.flashcardTopicInput.set('');
        if (res.flashcards && res.flashcards.length > 0) {
          // Las tarjetas nuevas se añaden al principio para no perder las anteriores.
          this.flashcards.update((arr) => [...res.flashcards, ...arr]);
          this.selectedFlashcard.set(String(res.flashcards[0].id));
        } else {
          this.loadFlashcards();
        }
      },
      error: (err) => {
        this.generatingFlashcards.set(false);
        this.flashcardError.set(err?.error?.error || 'Error al generar las flashcards');
      },
    });
  }

  selectFlashcard(id: string): void {
    this.selectedFlashcard.set(String(id));
  }

  deleteFlashcard(id: string): void {
    if (!confirm('¿Eliminar esta flashcard?')) return;
    this.ai.deleteResource(String(id)).subscribe({
      next: () => {
        const list = this.flashcards().filter((f) => String(f.id) !== String(id));
        this.flashcards.set(list);
        if (this.selectedFlashcard() === String(id)) {
          this.selectedFlashcard.set(list.length > 0 ? String(list[0].id) : null);
        }
      },
    });
  }

  get selectedFc(): Flashcard | null {
    const id = this.selectedFlashcard();
    return this.flashcards().find((f) => String(f.id) === String(id)) || null;
  }

}
