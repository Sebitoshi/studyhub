import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideAlignLeft,
  lucideArrowRightToLine,
  lucideArrowUpDown,
  lucideCheck,
  lucideClock,
  lucideCode,
  lucideCopy,
  lucideChevronLeft,
  lucideChevronRight,
  lucideFileText,
  lucideHeading1,
  lucideHeading2,
  lucideHeading3,
  lucideImage,
  lucideImagePlus,
  lucideList,
  lucideListOrdered,
  lucideListTree,
  lucideMinus,
  lucideQuote,
  lucideTable,
  lucideType,
  lucideMaximize2,
  lucideLoader,
  lucidePenLine,
  lucidePencil,
  lucidePin,
  lucidePlus,
  lucideRefreshCw,
  lucideSave,
  lucideSearch,
  lucideSparkles,
  lucideTrash2,
  lucideX,
  lucideZoomIn,
  lucideZoomOut,
} from '@ng-icons/lucide';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import {
  BLOCK_COMMANDS,
  NoteBlock,
  NoteBlockType,
  TABLE_TEMPLATE,
  blockToMarkdown,
  createBlock,
  filterBlockCommands,
  parseNoteMarkdown,
  serializeNoteBlocks,
} from '../../utils/note-blocks';
import {
  Note,
  NoteAssistantAction,
  NoteImage,
  SubjectsService,
} from '../../services/subjects.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

type SortMode = 'recent' | 'alpha';

interface AssistantActionOption {
  id: NoteAssistantAction;
  label: string;
  hint: string;
  icon: string;
  needsContent: boolean;
}

const ASSISTANT_ACTIONS: readonly AssistantActionOption[] = [
  {
    id: 'draft',
    label: 'Borrador',
    hint: 'Crea un apunte desde el título o una idea.',
    icon: 'lucidePenLine',
    needsContent: false,
  },
  {
    id: 'continue',
    label: 'Continuar',
    hint: 'Sigue el apunte donde se quedó.',
    icon: 'lucideArrowRightToLine',
    needsContent: true,
  },
  {
    id: 'improve',
    label: 'Mejorar',
    hint: 'Ordena y aclara sin cambiar el contenido.',
    icon: 'lucideSparkles',
    needsContent: true,
  },
  {
    id: 'summarize',
    label: 'Resumir',
    hint: 'Deja lo esencial y preguntas de repaso.',
    icon: 'lucideAlignLeft',
    needsContent: true,
  },
  {
    id: 'outline',
    label: 'Esquema',
    hint: 'Convierte el apunte en un mapa de estudio.',
    icon: 'lucideListTree',
    needsContent: true,
  },
];

/** Mínimo de contenido para las acciones que trabajan sobre el apunte (igual que el backend). */
const MIN_AI_CONTENT_CHARS = 40;

/** Inactividad antes de guardar automáticamente. */
const AUTOSAVE_MS = 900;
/** Duración de la animación de salida del editor. */
const CLOSE_ANIMATION_MS = 180;
/** Tiempo máximo que esperamos a que termine un guardado al cerrar. */
const CLOSE_FLUSH_TIMEOUT_MS = 6000;

/** Tope de imágenes por apunte (igual que el backend). */
const MAX_IMAGES_PER_NOTE = 20;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

/**
 * Apuntes de una materia: buscador, orden, tarjetas con markdown renderizado y un
 * editor a pantalla completa con vista previa y autoguardado.
 */
@Component({
  selector: 'app-subject-notes',
  standalone: true,
  imports: [NgIconComponent, FormsModule, MarkdownPipe, ConfirmDialogComponent],
  providers: [
    provideIcons({
      lucideAlertCircle,
      lucideAlignLeft,
      lucideArrowRightToLine,
      lucideArrowUpDown,
      lucideCheck,
      lucideClock,
      lucideCode,
      lucideCopy,
      lucideChevronLeft,
      lucideChevronRight,
      lucideFileText,
      lucideHeading1,
      lucideHeading2,
      lucideHeading3,
      lucideImage,
      lucideImagePlus,
      lucideList,
      lucideListOrdered,
      lucideMinus,
      lucideQuote,
      lucideTable,
      lucideType,
      lucideListTree,
      lucideMaximize2,
      lucideLoader,
      lucidePenLine,
      lucidePencil,
      lucidePin,
      lucidePlus,
      lucideRefreshCw,
      lucideSave,
      lucideSearch,
      lucideSparkles,
      lucideTrash2,
      lucideX,
      lucideZoomIn,
      lucideZoomOut,
    }),
  ],
  templateUrl: './subject-notes.component.html',
  styles: [
    `
      @keyframes notes-drawer-in {
        from { opacity: 0; transform: translateX(48px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes notes-drawer-out {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(48px); }
      }
      @keyframes notes-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes notes-backdrop-out { from { opacity: 1; } to { opacity: 0; } }

      .notes-drawer { animation: notes-drawer-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .notes-drawer-out { animation: notes-drawer-out 0.18s ease-in both; }
      .notes-backdrop { animation: notes-backdrop-in 0.2s ease-out both; }
      .notes-backdrop-out { animation: notes-backdrop-out 0.18s ease-in both; }

      .notes-clamp {
        position: relative;
        max-height: 7.2rem;
        overflow: hidden;
      }
      .notes-clamp::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2.2rem;
        background: linear-gradient(to bottom, transparent, var(--sh-surface));
        pointer-events: none;
      }

      .notes-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 0.6rem;
        color: var(--sh-faint);
        background: transparent;
        border: none;
        cursor: pointer;
        transition: color 0.18s ease, background 0.18s ease;
      }
      .notes-icon-btn:hover { color: var(--sh-text); background: var(--sh-hover); }
      .notes-icon-btn.is-active { color: var(--sh-primary-strong); }
      .notes-icon-btn.danger:hover { color: #dc2626; background: rgba(220, 38, 38, 0.1); }
      .notes-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      .notes-tool-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.35rem 0.6rem;
        border-radius: 0.6rem;
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--sh-muted);
        background: transparent;
        border: 1px solid transparent;
        cursor: pointer;
        transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
      }
      .notes-tool-btn:hover { color: var(--sh-text); background: var(--sh-hover); border-color: var(--sh-border); }

      .notes-search { padding-left: 2.25rem; padding-right: 2.25rem; }

      .notes-tab {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.625rem;
        border-radius: 0.55rem;
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--sh-muted);
        background: transparent;
        border: 1px solid transparent;
        cursor: pointer;
        transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
      }
      .notes-tab:hover { color: var(--sh-text); background: var(--sh-hover); }
      .notes-tab.is-active {
        color: var(--sh-primary-strong);
        background: var(--sh-surface);
        border-color: var(--sh-border);
        box-shadow: var(--sh-shadow);
      }

      .notes-action-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.2rem;
        text-align: left;
        padding: 0.55rem 0.6rem;
        border-radius: 0.7rem;
        border: 1px solid var(--sh-border);
        background: var(--sh-surface);
        color: var(--sh-muted);
        cursor: pointer;
        transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
      }
      .notes-action-card:hover { border-color: var(--sh-border-strong); color: var(--sh-text); }
      .notes-action-card.is-active {
        border-color: var(--sh-primary-strong);
        background: var(--sh-primary-soft);
        color: var(--sh-primary-strong);
      }
      .notes-action-card:disabled { opacity: 0.55; cursor: not-allowed; }

      .notes-ai-dot {
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 9999px;
        background: var(--sh-accent);
      }
    `,
  ],
})
export class SubjectNotesComponent implements OnInit, OnDestroy {
  private readonly subjectsService = inject(SubjectsService);
  private readonly imageUpload = inject(ImageUploadService);

  readonly subjectId = input.required<number>();

  /** Marcadores para el esqueleto de carga. */
  readonly skeletons = [1, 2, 3, 4, 5, 6];

  // ── Lista ──────────────────────────────────────────────────
  readonly notes = signal<Note[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly query = signal('');
  readonly sortMode = signal<SortMode>('recent');
  readonly pinnedOnly = signal(false);
  readonly busyId = signal<number | null>(null);
  readonly pendingDelete = signal<Note | null>(null);
  /** Se pide confirmación antes de cerrar un apunte con texto pero sin título. */
  readonly pendingDiscard = signal(false);

  // ── Editor ─────────────────────────────────────────────────
  readonly editorOpen = signal(false);
  readonly closing = signal(false);
  readonly current = signal<Note | null>(null);
  readonly draftTitle = signal('');
  /** Contenido como bloques editables; al guardar se serializa a Markdown. */
  readonly blocks = signal<NoteBlock[]>([createBlock('paragraph')]);
  readonly editingBlockId = signal<string | null>(null);
  readonly slashBlockId = signal<string | null>(null);
  readonly slashQuery = signal('');
  readonly slashIndex = signal(0);
  readonly draftContent = computed(() => serializeNoteBlocks(this.blocks()));
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly saveFailed = signal(false);
  readonly savedAt = signal<Date | null>(null);
  readonly assistantOpen = signal(false);

  // ── Imágenes del apunte ────────────────────────────────────
  /** Imágenes guardadas en Mongo para el apunte abierto. */
  readonly draftImages = signal<NoteImage[]>([]);
  readonly uploadingImage = signal(false);
  readonly uploadPercent = signal(0);
  readonly uploadError = signal<string | null>(null);
  /** Subidas antes de que exista la nota: se ligan en el primer guardado. */
  private readonly pendingImageIds = signal<string[]>([]);

  // ── Visor (zoom y pantalla completa) ───────────────────────
  readonly lightboxIndex = signal<number | null>(null);
  readonly zoom = signal(1);
  /** Imagen del markdown que no está guardada en Mongo (p. ej. generada por la IA). */
  private readonly lightboxExtra = signal<NoteImage | null>(null);

  // ── Asistente IA ───────────────────────────────────────────
  readonly assistantActions = ASSISTANT_ACTIONS;
  readonly aiAction = signal<NoteAssistantAction>('improve');
  readonly aiInstruction = signal('');
  readonly aiLoading = signal(false);
  readonly aiError = signal<string | null>(null);
  readonly aiProposal = signal<string | null>(null);
  readonly aiApplied = signal(false);
  readonly aiElapsed = signal(0);

  private aiSub?: Subscription;
  private aiTimer?: ReturnType<typeof setInterval>;

  private readonly nowTick = signal(Date.now());
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly drawerEl = viewChild<ElementRef<HTMLElement>>('drawer');
  private readonly imageInput = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  private readonly lightboxEl = viewChild<ElementRef<HTMLElement>>('lightbox');

  private saveTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;
  private saveInFlight = false;
  private forceClose = false;
  /** Cuenta de cambios locales; se compara con la revisión enviada al guardar. */
  private revision = 0;
  private inFlightRevision = 0;

  ngOnInit(): void {
    this.loadNotes();
    this.tickTimer = setInterval(() => this.nowTick.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    clearTimeout(this.saveTimer);
    clearTimeout(this.closeTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.aiSub?.unsubscribe();
    this.stopAiTimer();
  }

  // ── Derivados ──────────────────────────────────────────────

  readonly visibleNotes = computed(() => {
    // Sin tildes: buscar “limites” debe encontrar “Límites”.
    const term = this.normalize(this.query().trim());
    const onlyPinned = this.pinnedOnly();
    const mode = this.sortMode();

    let list = this.notes();
    if (onlyPinned) list = list.filter((note) => note.isPinned);
    if (term) {
      list = list.filter(
        (note) =>
          this.normalize(note.title).includes(term) || this.normalize(note.content).includes(term),
      );
    }

    const sorted = [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (mode === 'alpha') {
        return (a.title || '').localeCompare(b.title || '', 'es', { sensitivity: 'base' });
      }
      return this.timeOf(b) - this.timeOf(a);
    });
    return sorted;
  });

  readonly isFiltering = computed(() => this.query().trim().length > 0 || this.pinnedOnly());

  /** Imágenes del apunte en el orden en que aparecen en el documento. */
  readonly lightboxImages = computed<NoteImage[]>(() => {
    const images = this.blocks()
      .filter((block) => block.type === 'image' && !!block.url)
      .map((block) => {
        const known = this.draftImages().find((image) => image.url === block.url);
        return (
          known ?? {
            id: `block-${block.id}`,
            url: block.url as string,
            width: 0,
            height: 0,
            bytes: 0,
          }
        );
      });
    const extra = this.lightboxExtra();
    return extra ? [...images, extra] : images;
  });

  readonly slashItems = computed(() => filterBlockCommands(this.slashQuery()));
  readonly activeLightboxImage = computed(() => {
    const index = this.lightboxIndex();
    return index === null ? null : this.lightboxImages()[index] ?? null;
  });
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly canAddImages = computed(() => this.draftImages().length < MAX_IMAGES_PER_NOTE);
  readonly draftWords = computed(() => this.countWords(this.draftContent()));
  readonly draftChars = computed(() => this.draftContent().length);

  readonly saveLabel = computed(() => {
    if (this.saving()) return 'Guardando…';
    if (this.saveFailed()) return 'No se pudo guardar';
    if (this.dirty()) return 'Sin guardar';
    const at = this.savedAt();
    if (at) {
      const diff = this.nowTick() - at.getTime();
      if (diff < 12_000) return 'Guardado ahora';
      if (diff < 60_000) return `Guardado hace ${Math.max(1, Math.round(diff / 1000))} s`;
      return `Guardado hace ${Math.round(diff / 60_000)} min`;
    }
    return this.current() ? 'Guardado' : 'Sin guardar';
  });

  readonly aiActionOption = computed(
    () => ASSISTANT_ACTIONS.find((option) => option.id === this.aiAction()) ?? ASSISTANT_ACTIONS[0],
  );
  readonly aiActionLabel = computed(() => this.aiActionOption().label);
  readonly aiProposalWords = computed(() => this.countWords(this.aiProposal()));
  readonly aiNeedsInput = computed(() => {
    if (this.aiAction() === 'draft') {
      return !this.draftTitle().trim() && !this.aiInstruction().trim();
    }
    return this.draftContent().trim().length < MIN_AI_CONTENT_CHARS;
  });
  readonly aiInputHint = computed(() => {
    if (!this.aiNeedsInput()) return '';
    if (this.aiAction() === 'draft') {
      return 'Escribe un título o una indicación para que la IA sepa de qué tratar el borrador.';
    }
    return `Escribe al menos ${MIN_AI_CONTENT_CHARS} caracteres de contenido para usar «${this.aiActionLabel()}».`;
  });
  readonly aiApplyLabel = computed(() => {
    if (this.aiAction() === 'continue') return 'Añadir al final';
    return this.draftContent().trim() ? 'Reemplazar apunte' : 'Usar como contenido';
  });

  // ── Utilidades de plantilla ────────────────────────────────

  /** Minúsculas y sin diacríticos, para comparar búsquedas en español. */
  private normalize(text?: string | null): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  countWords(text?: string | null): number {
    const value = (text || '').trim();
    return value ? value.split(/\s+/).length : 0;
  }

  relativeTime(iso?: string): string {
    const now = this.nowTick();
    if (!iso) return 'Sin fecha';
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return 'Sin fecha';

    const diff = now - time;
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return 'hace un momento';
    if (diff < hour) return `hace ${Math.floor(diff / minute)} min`;
    if (diff < day) return `hace ${Math.floor(diff / hour)} h`;
    if (diff < 7 * day) return `hace ${Math.floor(diff / day)} d`;
    return new Date(time).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  private timeOf(note: Note): number {
    const raw = note.updatedAt || note.createdAt;
    return raw ? new Date(raw).getTime() || 0 : 0;
  }

  // ── Lista ──────────────────────────────────────────────────

  loadNotes(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.subjectsService.getSubject(this.subjectId()).subscribe({
      next: (subject) => {
        this.notes.set(subject.notes || []);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  toggleSort(): void {
    this.sortMode.set(this.sortMode() === 'recent' ? 'alpha' : 'recent');
  }

  togglePinnedOnly(): void {
    this.pinnedOnly.set(!this.pinnedOnly());
  }

  clearSearch(): void {
    this.query.set('');
  }

  private upsertNote(note: Note): void {
    this.notes.update((list) => {
      const index = list.findIndex((item) => item.id === note.id);
      if (index === -1) return [note, ...list];
      const copy = [...list];
      copy[index] = note;
      return copy;
    });
  }

  // ── Acciones de tarjeta ────────────────────────────────────

  togglePin(note: Note, event: Event): void {
    event.stopPropagation();
    if (this.busyId()) return;
    this.busyId.set(note.id);
    this.subjectsService.togglePinNote(this.subjectId(), note.id).subscribe({
      next: (updated) => {
        this.upsertNote(updated);
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }

  duplicate(note: Note, event: Event): void {
    event.stopPropagation();
    if (this.busyId()) return;
    this.busyId.set(note.id);
    const base = (note.title || 'Apunte').trim();
    this.subjectsService
      .addNote(this.subjectId(), { title: `${base} (copia)`.slice(0, 120), content: note.content })
      .subscribe({
        next: (created) => {
          this.upsertNote(created);
          this.busyId.set(null);
        },
        error: () => this.busyId.set(null),
      });
  }

  askDelete(note: Note, event: Event): void {
    event.stopPropagation();
    this.pendingDelete.set(note);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const note = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!note) return;

    this.busyId.set(note.id);
    this.subjectsService.deleteNote(this.subjectId(), note.id).subscribe({
      next: () => {
        this.notes.update((list) => list.filter((item) => item.id !== note.id));
        this.busyId.set(null);
        if (this.current()?.id === note.id) {
          this.forceClose = true;
          this.teardown();
        }
      },
      error: () => this.busyId.set(null),
    });
  }

  // ── Editor ─────────────────────────────────────────────────

  openNew(): void {
    this.open(null);
  }

  openEditor(note: Note): void {
    this.open(note);
  }

  private open(note: Note | null): void {
    this.closing.set(false);
    this.forceClose = false;
    this.current.set(note);
    this.draftTitle.set(note?.title ?? '');
    this.setContent(note?.content ?? '');
    this.dirty.set(false);
    this.saveFailed.set(false);
    this.savedAt.set(null);
    this.revision = 0;
    this.inFlightRevision = 0;
    this.resetAssistant();
    this.assistantOpen.set(false);
    this.draftImages.set(note?.images ? [...note.images] : []);
    this.pendingImageIds.set([]);
    this.uploadError.set(null);
    this.uploadPercent.set(0);
    this.uploadingImage.set(false);
    this.closeLightbox();
    this.showImagesWithoutBlock();
    this.editorOpen.set(true);
    setTimeout(() => this.titleInput()?.nativeElement.focus());
  }

  onTitleChange(value: string): void {
    this.draftTitle.set(value);
    this.markDirty();
  }

  /** Reemplaza todo el contenido del apunte (asistente IA y pruebas). */
  onContentChange(value: string): void {
    this.setContent(value);
    this.markDirty();
  }

  private setContent(markdown: string): void {
    this.blocks.set(parseNoteMarkdown(markdown));
    this.editingBlockId.set(null);
    this.closeSlash();
  }

  private markDirty(): void {
    if (!this.editorOpen() || this.closing()) return;
    this.revision += 1;
    this.dirty.set(true);
    this.saveFailed.set(false);
    this.aiApplied.set(false);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), AUTOSAVE_MS);
  }

  /** Guarda de inmediato (botón, Ctrl+S o al cerrar). */
  saveNow(): void {
    clearTimeout(this.saveTimer);
    this.persist();
  }

  private persist(): void {
    if (this.saveInFlight) return;

    const title = this.draftTitle().trim();
    const content = this.draftContent();
    // Sin título no hay nada que guardar: el backend lo exige.
    if (!title) return;
    if (!this.dirty() && this.current()) return;

    const existing = this.current();
    this.saveInFlight = true;
    this.inFlightRevision = this.revision;
    this.saving.set(true);
    this.saveFailed.set(false);

    const pendingImages = this.pendingImageIds();
    const payload: { title: string; content: string; imageIds?: string[] } = { title, content };
    if (pendingImages.length) payload.imageIds = pendingImages;

    const request$ = existing
      ? this.subjectsService.updateNote(this.subjectId(), existing.id, { title, content })
      : this.subjectsService.addNote(this.subjectId(), payload);

    request$.subscribe({
      next: (saved) => {
        this.saveInFlight = false;
        this.saving.set(false);
        this.savedAt.set(new Date());
        this.upsertNote(saved);
        if (!existing) {
          this.current.set(saved);
          this.pendingImageIds.set([]);
        }
        if (saved.images) this.draftImages.set([...saved.images]);

        if (this.revision !== this.inFlightRevision) {
          // El usuario siguió escribiendo: guardamos otra vez enseguida.
          this.dirty.set(true);
          clearTimeout(this.saveTimer);
          this.saveTimer = setTimeout(() => this.persist(), 250);
        } else {
          this.dirty.set(false);
        }
      },
      error: () => {
        this.saveInFlight = false;
        this.saving.set(false);
        this.saveFailed.set(true);
        // Reintento silencioso por si fue un corte momentáneo de red.
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.persist(), 4000);
      },
    });
  }

  // ── Imágenes del apunte ────────────────────────────────────

  openImagePicker(): void {
    if (this.uploadingImage() || !this.canAddImages()) return;
    this.imageInput()?.nativeElement.click();
  }

  /** Sube (en serie) las imágenes elegidas y las inserta en el apunte. */
  async onImagesPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    for (const file of files) {
      if (this.draftImages().length >= MAX_IMAGES_PER_NOTE) break;
      await this.uploadImage(file);
    }
  }

  private async uploadImage(file: File): Promise<void> {
    if (this.uploadingImage()) return;

    this.uploadingImage.set(true);
    this.uploadPercent.set(0);
    this.uploadError.set(null);

    try {
      const result = await firstValueFrom(
        this.imageUpload.uploadNoteImage(
          file,
          this.subjectId(),
          this.current()?.id ?? null,
          (progress) => this.uploadPercent.set(progress.percent),
        ),
      );

      const image: NoteImage = {
        id: result.id,
        url: result.url,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        subjectId: result.subjectId,
        noteId: result.noteId,
      };
      this.draftImages.update((list) => [...list, image]);
      if (!this.current()) {
        this.pendingImageIds.update((ids) => [...ids, result.id]);
      }
      this.insertImageBlock(image);
    } catch (error) {
      this.uploadError.set(this.uploadErrorMessage(error));
    } finally {
      this.uploadingImage.set(false);
      this.uploadPercent.set(0);
    }
  }

  /** Inserta la imagen como bloque propio, en el punto donde está el cursor. */
  private insertImageBlock(image: NoteImage): void {
    const alt = (this.draftTitle().trim() || 'Imagen del apunte').replace(/[[\]]/g, '');
    const list = [...this.blocks()];
    let insertAt = list.length;

    const editingId = this.editingBlockId();
    if (editingId) {
      const index = list.findIndex((block) => block.id === editingId);
      if (index >= 0) {
        const current = list[index];
        if (current.type === 'paragraph' && !current.text.trim()) {
          list.splice(index, 1);
          insertAt = index;
        } else {
          insertAt = index + 1;
        }
      }
    }

    list.splice(insertAt, 0, createBlock('image', alt, { url: image.url }));

    const after = list[insertAt + 1];
    const nextBlock =
      after && after.type === 'paragraph' && !after.text.trim()
        ? after
        : createBlock('paragraph');
    if (nextBlock !== after) list.splice(insertAt + 1, 0, nextBlock);

    this.blocks.set(list);
    this.markDirty();
    this.focusBlock(nextBlock.id);
  }

  // ── Bloques: edición, comandos y orden ─────────────────────

  blockMarkdown(block: NoteBlock): string {
    return blockToMarkdown(block);
  }

  blockRows(block: NoteBlock): number {
    const lines = (block.text || '').split('\n').length;
    const minimum = block.type === 'code' || block.type === 'table' ? 3 : 1;
    return Math.max(minimum, Math.min(24, lines));
  }

  blockLabel(type: NoteBlockType): string {
    return BLOCK_COMMANDS.find((command) => command.type === type)?.label ?? 'Bloque';
  }

  blockPlaceholder(type: NoteBlockType): string {
    switch (type) {
      case 'heading1':
        return 'Título 1';
      case 'heading2':
        return 'Título 2';
      case 'heading3':
        return 'Título 3';
      case 'bullet':
        return 'Elemento de la lista';
      case 'number':
        return 'Elemento numerado';
      case 'quote':
        return 'Cita';
      case 'code':
        return 'Código o fórmula';
      case 'table':
        return 'Tabla en Markdown';
      default:
        return 'Escribe algo, o “/” para insertar…';
    }
  }

  startEditing(block: NoteBlock): void {
    this.focusBlock(block.id);
  }

  private focusBlock(id: string, caret: 'start' | 'end' = 'end'): void {
    this.editingBlockId.set(id);
    setTimeout(() => {
      const input = this.drawerEl()?.nativeElement.querySelector<HTMLTextAreaElement>(
        `textarea[data-block-editor="${id}"]`,
      );
      if (!input) return;
      input.focus();
      const position = caret === 'start' ? 0 : input.value.length;
      input.setSelectionRange(position, position);
    });
  }

  private updateBlock(id: string, patch: Partial<NoteBlock>): void {
    this.blocks.update((list) =>
      list.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );
  }

  onBlockInput(block: NoteBlock, value: string): void {
    this.updateBlock(block.id, { text: value });
    this.markDirty();

    const command = value.match(/^\/([^\s/]*)$/);
    if (command) {
      this.slashBlockId.set(block.id);
      this.slashQuery.set(command[1]);
      this.slashIndex.set(0);
    } else if (this.slashBlockId() === block.id) {
      this.closeSlash();
    }
  }

  closeSlash(): void {
    this.slashBlockId.set(null);
    this.slashQuery.set('');
    this.slashIndex.set(0);
  }

  onBlockBlur(block: NoteBlock): void {
    // Se espera un instante: si el foco se fue a otra parte del editor no se
    // cierra el bloque (evita parpadeos al pulsar un comando del menú).
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.getAttribute?.('data-block-editor') === block.id) return;
      if (this.editingBlockId() === block.id) this.editingBlockId.set(null);
      if (this.slashBlockId() === block.id) this.closeSlash();
    });
  }

  onBlockKeydown(event: KeyboardEvent, block: NoteBlock, index: number): void {
    if (this.slashBlockId() === block.id) {
      const items = this.slashItems();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.slashIndex.set(items.length ? (this.slashIndex() + 1) % items.length : 0);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.slashIndex.set(
          items.length ? (this.slashIndex() - 1 + items.length) % items.length : 0,
        );
        return;
      }
      if (event.key === 'Enter' && items.length) {
        event.preventDefault();
        this.applySlash(items[this.slashIndex()].type);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeSlash();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.splitBlock(block, index);
      return;
    }

    const input = event.target as HTMLTextAreaElement;
    const value = input?.value ?? '';
    const collapsed = input?.selectionStart === input?.selectionEnd;
    const atStart = collapsed && input?.selectionStart === 0;
    const atEnd = collapsed && input?.selectionStart === value.length;

    if (event.key === 'Backspace' && atStart) {
      event.preventDefault();
      this.mergeWithPrevious(block, index);
      return;
    }

    if (event.key === 'ArrowUp' && atStart) {
      const previous = this.blocks()[index - 1];
      if (previous && previous.type !== 'image' && previous.type !== 'divider') {
        event.preventDefault();
        this.focusBlock(previous.id);
      }
      return;
    }

    if (event.key === 'ArrowDown' && atEnd) {
      const next = this.blocks()[index + 1];
      if (next && next.type !== 'image' && next.type !== 'divider') {
        event.preventDefault();
        this.focusBlock(next.id, 'start');
      }
    }
  }

  private splitBlock(block: NoteBlock, index: number): void {
    const type: NoteBlockType =
      block.type === 'bullet' || block.type === 'number' ? block.type : 'paragraph';
    const next = createBlock(type);
    this.blocks.update((list) => {
      const copy = [...list];
      copy.splice(index + 1, 0, next);
      return copy;
    });
    // Un elemento de lista vacío que se queda solo vuelve a ser texto normal.
    if (!block.text.trim() && type !== 'paragraph') {
      this.updateBlock(block.id, { type: 'paragraph' });
    }
    this.focusBlock(next.id);
  }

  private mergeWithPrevious(block: NoteBlock, index: number): void {
    const previous = this.blocks()[index - 1];
    if (!previous) return;

    if (previous.type === 'image' || previous.type === 'divider' || !block.text) {
      this.dropBlock(block.id);
      this.focusBlock(previous.id);
      return;
    }

    this.updateBlock(previous.id, { text: `${previous.text}${block.text}` });
    this.dropBlock(block.id);
    this.focusBlock(previous.id);
  }

  appendParagraph(): void {
    const block = createBlock('paragraph');
    this.blocks.update((list) => [...list, block]);
    this.focusBlock(block.id);
  }

  /** Botón «Añadir bloque»: crea un párrafo y abre la lista de comandos. */
  openBlockMenu(): void {
    const block = createBlock('paragraph');
    this.blocks.update((list) => [...list, block]);
    this.focusBlock(block.id);
    this.slashBlockId.set(block.id);
    this.slashQuery.set('');
    this.slashIndex.set(0);
  }

  applySlash(type: NoteBlockType): void {
    const blockId = this.slashBlockId();
    this.closeSlash();
    if (!blockId) return;

    if (type === 'image') {
      this.updateBlock(blockId, { text: '' });
      this.openImagePicker();
      return;
    }

    if (type === 'divider') {
      this.updateBlock(blockId, { type: 'divider', text: '' });
      const next = createBlock('paragraph');
      this.blocks.update((list) => {
        const index = list.findIndex((block) => block.id === blockId);
        const copy = [...list];
        copy.splice(index + 1, 0, next);
        return copy;
      });
      this.markDirty();
      this.focusBlock(next.id);
      return;
    }

    this.updateBlock(blockId, {
      type,
      text: type === 'table' ? TABLE_TEMPLATE : '',
    });
    this.markDirty();
    this.focusBlock(blockId);
  }

  removeBlock(block: NoteBlock, event?: Event): void {
    event?.stopPropagation();
    if (block.type === 'image' && block.url) {
      const image = this.draftImages().find((item) => item.url === block.url);
      if (image) {
        this.removeImage(image, event);
        return;
      }
    }
    this.dropBlock(block.id);
  }

  private dropBlock(id: string): void {
    this.blocks.set(this.ensureEditableBlock(this.blocks().filter((block) => block.id !== id)));
    this.markDirty();
  }

  private ensureEditableBlock(blocks: NoteBlock[]): NoteBlock[] {
    return blocks.length ? blocks : [createBlock('paragraph')];
  }

  /** Las imágenes guardadas pero ausentes del texto se muestran al final. */
  private showImagesWithoutBlock(): void {
    const missing = this.draftImages().filter(
      (image) => !this.blocks().some((block) => block.type === 'image' && block.url === image.url),
    );
    if (!missing.length) return;
    this.blocks.update((list) => [
      ...list,
      ...missing.map((image) => createBlock('image', '', { url: image.url })),
    ]);
  }

  /** Borra la imagen del apunte (Mongo incluido) y su bloque del documento. */
  removeImage(image: NoteImage, event?: Event): void {
    event?.stopPropagation();
    if (image.id.startsWith('external-') || image.id.startsWith('block-')) {
      this.forgetImage(image);
      return;
    }
    this.imageUpload.deleteNoteImage(image.id).subscribe({
      next: () => this.forgetImage(image),
      error: () => this.forgetImage(image),
    });
  }

  private forgetImage(image: NoteImage): void {
    this.draftImages.update((list) => list.filter((item) => item.id !== image.id));
    this.pendingImageIds.update((ids) => ids.filter((id) => id !== image.id));

    const before = this.blocks();
    const blocks = before.filter((block) =>
      block.type === 'image' ? block.url !== image.url : !block.text.includes(image.url),
    );
    if (blocks.length !== before.length) {
      this.blocks.set(this.ensureEditableBlock(blocks));
      this.markDirty();
    }

    if (this.lightboxIndex() !== null) this.closeLightbox();
  }

  private uploadErrorMessage(error: any): string {
    const status = Number(error?.status ?? 0);
    const body = error?.error?.message;
    const message = Array.isArray(body) ? body[0] : body;
    if (typeof message === 'string' && message.trim()) return message;
    if (status === 402) return 'Agotaste tus usos diarios de imágenes. Se renuevan mañana.';
    if (status === 413) return 'La imagen es demasiado grande. Prueba con una más ligera.';
    if (status === 0) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
    return 'No pudimos subir la imagen. Inténtalo de nuevo.';
  }

  imageUrl(url?: string | null): string | null {
    return this.imageUpload.noteImageUrl(url);
  }

  // ── Visor: zoom y pantalla completa ───────────────────────

  openLightbox(index: number): void {
    this.zoom.set(1);
    this.lightboxIndex.set(index);
  }

  /** Abre el visor al pulsar una imagen del apunte. */
  openLightboxForUrl(url: string | undefined, event?: Event): void {
    event?.stopPropagation();
    const value = (url ?? '').trim();
    if (!value) return;

    const index = this.lightboxImages().findIndex(
      (image) => image.url === value || this.imageUrl(image.url) === value,
    );
    if (index >= 0) {
      this.openLightbox(index);
      return;
    }

    this.lightboxExtra.set({
      id: `external-${Date.now()}`,
      url: value,
      width: 0,
      height: 0,
      bytes: 0,
    });
    this.openLightbox(this.lightboxImages().length - 1);
  }

  closeLightbox(): void {
    this.lightboxIndex.set(null);
    this.lightboxExtra.set(null);
    this.zoom.set(1);
  }

  zoomIn(): void {
    this.zoom.set(Math.min(MAX_ZOOM, this.zoom() + ZOOM_STEP));
  }

  zoomOut(): void {
    this.zoom.set(Math.max(MIN_ZOOM, this.zoom() - ZOOM_STEP));
  }

  resetZoom(): void {
    this.zoom.set(1);
  }

  stepLightbox(delta: number): void {
    const images = this.lightboxImages();
    if (!images.length) return;
    const index = this.lightboxIndex() ?? 0;
    this.zoom.set(1);
    this.lightboxIndex.set((index + delta + images.length) % images.length);
  }

  async toggleFullscreen(): Promise<void> {
    const element = this.lightboxEl()?.nativeElement;
    if (!element) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
    } catch {
      // En móviles sin API de pantalla completa el visor ya ocupa toda la ventana.
    }
  }

  // ── Asistente IA ───────────────────────────────────────────

  openAssistant(): void {
    this.assistantOpen.set(true);
    this.aiApplied.set(false);
  }

  closeAssistant(): void {
    this.assistantOpen.set(false);
  }

  selectAssistantAction(action: NoteAssistantAction): void {
    if (this.aiLoading()) return;
    this.aiAction.set(action);
    this.aiError.set(null);
    this.aiProposal.set(null);
    this.aiApplied.set(false);
  }

  onAiInstructionChange(value: string): void {
    this.aiInstruction.set(value);
    this.aiError.set(null);
  }

  /** Pide una propuesta a la IA con el estado actual del editor. */
  generateProposal(): void {
    if (this.aiLoading() || this.aiNeedsInput()) return;

    this.aiLoading.set(true);
    this.aiError.set(null);
    this.aiProposal.set(null);
    this.aiApplied.set(false);
    this.aiElapsed.set(0);

    const startedAt = Date.now();
    this.stopAiTimer();
    this.aiTimer = setInterval(
      () => this.aiElapsed.set(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );

    this.aiSub?.unsubscribe();
    this.aiSub = this.subjectsService
      .assistNote(this.subjectId(), {
        action: this.aiAction(),
        title: this.draftTitle().trim() || undefined,
        content: this.draftContent().trim() || undefined,
        instruction: this.aiInstruction().trim() || undefined,
      })
      .subscribe({
        next: (response) => {
          this.stopAiTimer();
          this.aiLoading.set(false);
          this.aiProposal.set(response.proposal.trim());
        },
        error: (error) => {
          this.stopAiTimer();
          this.aiLoading.set(false);
          this.aiError.set(this.aiErrorMessage(error));
        },
      });
  }

  cancelProposal(): void {
    this.aiSub?.unsubscribe();
    this.aiSub = undefined;
    this.stopAiTimer();
    this.aiLoading.set(false);
    this.aiElapsed.set(0);
  }

  discardProposal(): void {
    this.cancelProposal();
    this.aiProposal.set(null);
    this.aiError.set(null);
    this.aiApplied.set(false);
  }

  retryProposal(): void {
    this.aiError.set(null);
    this.generateProposal();
  }

  /** Aplica la propuesta al borrador; el autoguardado se encarga del resto. */
  applyProposal(mode: 'replace' | 'append'): void {
    const proposal = this.aiProposal();
    if (!proposal) return;

    const current = this.draftContent();
    const next =
      mode === 'append' && current.trim() ? `${current.trimEnd()}\n\n${proposal}` : proposal;

    this.onContentChange(next);
    this.aiProposal.set(null);
    this.aiError.set(null);
    this.aiApplied.set(true);
    this.assistantOpen.set(false);
  }

  private stopAiTimer(): void {
    if (this.aiTimer) clearInterval(this.aiTimer);
    this.aiTimer = undefined;
  }

  private resetAssistant(): void {
    this.cancelProposal();
    this.aiProposal.set(null);
    this.aiError.set(null);
    this.aiApplied.set(false);
    this.aiInstruction.set('');
  }

  private aiErrorMessage(error: any): string {
    const status = Number(error?.status ?? 0);
    const body = error?.error?.message;
    const message = Array.isArray(body) ? body[0] : body;
    if (typeof message === 'string' && message.trim()) return message;
    if (status === 0) return 'No pudimos conectar con el asistente. Revisa tu conexión.';
    return 'No pudimos generar la propuesta. Inténtalo de nuevo.';
  }

  requestClose(): void {
    if (!this.editorOpen() || this.closing()) return;

    // Sin título el backend no guarda: no cerramos perdiendo el texto sin avisar.
    if (this.draftContent().trim() && !this.draftTitle().trim()) {
      this.pendingDiscard.set(true);
      return;
    }

    this.saveNow();
    this.closing.set(true);

    const deadline = Date.now() + CLOSE_FLUSH_TIMEOUT_MS;
    const finish = () => {
      if (this.saving() && Date.now() < deadline) {
        this.closeTimer = setTimeout(finish, 120);
        return;
      }
      // No cerramos perdiendo cambios: avisamos y dejamos reintentar.
      if (this.saveFailed() && !this.forceClose) {
        this.forceClose = true;
        this.closing.set(false);
        return;
      }
      this.teardown();
    };
    this.closeTimer = setTimeout(finish, CLOSE_ANIMATION_MS);
  }

  cancelDiscard(): void {
    this.pendingDiscard.set(false);
    setTimeout(() => this.titleInput()?.nativeElement.focus());
  }

  discardAndClose(): void {
    this.pendingDiscard.set(false);
    this.forceClose = true;
    this.teardown();
  }

  private teardown(): void {
    clearTimeout(this.saveTimer);
    clearTimeout(this.closeTimer);
    this.editorOpen.set(false);
    this.closing.set(false);
    this.current.set(null);
    this.draftTitle.set('');
    this.blocks.set([createBlock('paragraph')]);
    this.editingBlockId.set(null);
    this.closeSlash();
    this.dirty.set(false);
    this.saving.set(false);
    this.saveFailed.set(false);
    this.savedAt.set(null);
    this.pendingDelete.set(null);
    this.pendingDiscard.set(false);
    this.assistantOpen.set(false);
    this.resetAssistant();
    this.draftImages.set([]);
    this.pendingImageIds.set([]);
    this.uploadError.set(null);
    this.uploadPercent.set(0);
    this.uploadingImage.set(false);
    this.closeLightbox();
  }

  onDrawerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const root = this.drawerEl()?.nativeElement;
    if (!root) return;

    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null || element === document.activeElement);

    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const inField =
      !!target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const modifier = event.ctrlKey || event.metaKey;

    // El visor tiene prioridad: Esc cierra la imagen, no el editor.
    if (this.lightboxIndex() !== null) {
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeLightbox();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.stepLightbox(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.stepLightbox(-1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        this.zoomIn();
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        this.zoomOut();
      } else if (event.key === '0') {
        event.preventDefault();
        this.resetZoom();
      } else if (key === 'f') {
        event.preventDefault();
        void this.toggleFullscreen();
      }
      return;
    }

    if (this.editorOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Primero se descarta la propuesta o se cancela la generación; recién
        // después se cierra el editor.
        if (this.slashBlockId()) {
          this.closeSlash();
        } else if (this.editingBlockId()) {
          this.editingBlockId.set(null);
        } else if (this.aiLoading()) {
          this.cancelProposal();
        } else if (this.aiProposal()) {
          this.discardProposal();
        } else {
          this.requestClose();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.saveNow();
      }
      return;
    }

    if (modifier && event.key === 'Enter' && !inField) {
      event.preventDefault();
      this.openNew();
    }
  }
}
