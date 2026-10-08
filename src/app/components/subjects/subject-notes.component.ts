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
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideArrowUpDown,
  lucideCheck,
  lucideClock,
  lucideCopy,
  lucideEye,
  lucideEyeOff,
  lucideFileText,
  lucideLoader,
  lucidePencil,
  lucidePin,
  lucidePlus,
  lucideRefreshCw,
  lucideSave,
  lucideSearch,
  lucideTrash2,
  lucideX,
} from '@ng-icons/lucide';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { Note, SubjectsService } from '../../services/subjects.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

type SortMode = 'recent' | 'alpha';

/** Inactividad antes de guardar automáticamente. */
const AUTOSAVE_MS = 900;
/** Duración de la animación de salida del editor. */
const CLOSE_ANIMATION_MS = 180;
/** Tiempo máximo que esperamos a que termine un guardado al cerrar. */
const CLOSE_FLUSH_TIMEOUT_MS = 6000;

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
      lucideArrowUpDown,
      lucideCheck,
      lucideClock,
      lucideCopy,
      lucideEye,
      lucideEyeOff,
      lucideFileText,
      lucideLoader,
      lucidePencil,
      lucidePin,
      lucidePlus,
      lucideRefreshCw,
      lucideSave,
      lucideSearch,
      lucideTrash2,
      lucideX,
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
    `,
  ],
})
export class SubjectNotesComponent implements OnInit, OnDestroy {
  private readonly subjectsService = inject(SubjectsService);

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
  readonly draftContent = signal('');
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly saveFailed = signal(false);
  readonly savedAt = signal<Date | null>(null);
  readonly showPreview = signal(true);

  private readonly nowTick = signal(Date.now());
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');
  private readonly drawerEl = viewChild<ElementRef<HTMLElement>>('drawer');

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
    this.draftContent.set(note?.content ?? '');
    this.dirty.set(false);
    this.saveFailed.set(false);
    this.savedAt.set(null);
    this.revision = 0;
    this.inFlightRevision = 0;
    this.editorOpen.set(true);
    setTimeout(() => this.titleInput()?.nativeElement.focus());
  }

  onTitleChange(value: string): void {
    this.draftTitle.set(value);
    this.markDirty();
  }

  onContentChange(value: string): void {
    this.draftContent.set(value);
    this.markDirty();
  }

  private markDirty(): void {
    if (!this.editorOpen() || this.closing()) return;
    this.revision += 1;
    this.dirty.set(true);
    this.saveFailed.set(false);
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

    const request$ = existing
      ? this.subjectsService.updateNote(this.subjectId(), existing.id, { title, content })
      : this.subjectsService.addNote(this.subjectId(), { title, content });

    request$.subscribe({
      next: (saved) => {
        this.saveInFlight = false;
        this.saving.set(false);
        this.savedAt.set(new Date());
        this.upsertNote(saved);
        if (!existing) this.current.set(saved);

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
    this.draftContent.set('');
    this.dirty.set(false);
    this.saving.set(false);
    this.saveFailed.set(false);
    this.savedAt.set(null);
    this.pendingDelete.set(null);
    this.pendingDiscard.set(false);
    this.showPreview.set(true);
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

    if (this.editorOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.requestClose();
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
