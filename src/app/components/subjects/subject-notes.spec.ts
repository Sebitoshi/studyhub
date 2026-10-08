import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Note, SubjectsService } from '../../services/subjects.service';
import { SubjectNotesComponent } from './subject-notes.component';

/** Debe coincidir con AUTOSAVE_MS del componente. */
const AUTOSAVE_MS = 900;

function makeNote(overrides: Partial<Note>): Note {
  return {
    id: 1,
    title: 'Nota',
    content: 'Contenido',
    isPinned: false,
    subjectId: 1,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

const NOTES: Note[] = [
  makeNote({
    id: 1,
    title: 'Zeta',
    content: 'La derivada mide el cambio.',
    updatedAt: '2026-10-03T10:00:00.000Z',
  }),
  makeNote({
    id: 2,
    title: 'Matrices',
    content: 'Producto de matrices',
    isPinned: true,
    updatedAt: '2026-10-01T10:00:00.000Z',
  }),
  makeNote({
    id: 3,
    title: 'Álgebra',
    content: 'Vectores y espacios',
    updatedAt: '2026-10-02T10:00:00.000Z',
  }),
];

describe('SubjectNotesComponent', () => {
  let fixture: ComponentFixture<SubjectNotesComponent>;
  let component: SubjectNotesComponent;

  const service = {
    getSubject: vi.fn(),
    addNote: vi.fn(),
    updateNote: vi.fn(),
    togglePinNote: vi.fn(),
    deleteNote: vi.fn(),
  };

  beforeEach(async () => {
    service.getSubject.mockReset();
    service.addNote.mockReset();
    service.updateNote.mockReset();
    service.togglePinNote.mockReset();
    service.deleteNote.mockReset();
    service.getSubject.mockReturnValue(of({ notes: NOTES }));

    await TestBed.configureTestingModule({
      imports: [SubjectNotesComponent],
      providers: [{ provide: SubjectsService, useValue: service }],
    }).compileComponents();

    vi.useFakeTimers();
    fixture = TestBed.createComponent(SubjectNotesComponent);
    fixture.componentRef.setInput('subjectId', 1);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('carga las notas y deja las fijadas primero', () => {
    expect(component.loading()).toBe(false);
    expect(component.notes().length).toBe(3);
    expect(component.visibleNotes().map((note) => note.title)).toEqual([
      'Matrices',
      'Zeta',
      'Álgebra',
    ]);
  });

  it('busca por título y por contenido', () => {
    component.query.set('cambio');
    expect(component.visibleNotes().map((note) => note.title)).toEqual(['Zeta']);

    component.query.set('producto');
    expect(component.visibleNotes().map((note) => note.title)).toEqual(['Matrices']);

    // Sin tildes: “algebra” debe encontrar “Álgebra”.
    component.query.set('algebra');
    expect(component.visibleNotes().map((note) => note.title)).toEqual(['Álgebra']);

    // Y al revés: “álgebra” con tilde también.
    component.query.set('álgebra');
    expect(component.visibleNotes().map((note) => note.title)).toEqual(['Álgebra']);
  });

  it('filtra solo las fijadas y alterna el orden alfabético', () => {
    component.pinnedOnly.set(true);
    expect(component.visibleNotes().map((note) => note.id)).toEqual([2]);

    component.pinnedOnly.set(false);
    component.sortMode.set('alpha');
    expect(component.visibleNotes().map((note) => note.title)).toEqual([
      'Matrices',
      'Álgebra',
      'Zeta',
    ]);
  });

  it('guarda una nota existente tras el debounce del autoguardado', () => {
    service.updateNote.mockReturnValue(
      of(makeNote({ id: 1, title: 'Zeta', content: 'Contenido nuevo' })),
    );

    component.openEditor(component.notes()[0]);
    component.onContentChange('Contenido nuevo');

    vi.advanceTimersByTime(AUTOSAVE_MS - 100);
    expect(service.updateNote).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(service.updateNote).toHaveBeenCalledTimes(1);
    expect(service.updateNote).toHaveBeenCalledWith(1, 1, {
      title: 'Zeta',
      content: 'Contenido nuevo',
    });
    expect(component.dirty()).toBe(false);
    expect(component.saveLabel()).toBe('Guardado ahora');
  });

  it('no crea apuntes sin título y sí con él', () => {
    const created = makeNote({ id: 9, title: 'Física', content: 'E=mc²' });
    service.addNote.mockReturnValue(of(created));

    component.openNew();
    component.onContentChange('E=mc²');
    vi.advanceTimersByTime(AUTOSAVE_MS + 100);
    expect(service.addNote).not.toHaveBeenCalled();

    component.onTitleChange('Física');
    vi.advanceTimersByTime(AUTOSAVE_MS + 100);
    expect(service.addNote).toHaveBeenCalledWith(1, { title: 'Física', content: 'E=mc²' });
    expect(component.current()?.id).toBe(9);
    expect(component.dirty()).toBe(false);
  });

  it('duplica un apunte añadiendo “(copia)”', () => {
    service.addNote.mockReturnValue(of(makeNote({ id: 5, title: 'Zeta (copia)' })));
    const note = component.notes()[0];

    component.duplicate(note, new MouseEvent('click'));

    expect(service.addNote).toHaveBeenCalledWith(1, {
      title: 'Zeta (copia)',
      content: note.content,
    });
    expect(component.notes().some((item) => item.id === 5)).toBe(true);
  });

  it('elimina la nota al confirmar', () => {
    service.deleteNote.mockReturnValue(of(void 0));

    component.pendingDelete.set(component.notes()[1]);
    component.confirmDelete();

    expect(service.deleteNote).toHaveBeenCalledWith(1, 2);
    expect(component.notes().some((item) => item.id === 2)).toBe(false);
  });

  it('pide confirmación al cerrar con contenido y sin título', () => {
    component.openNew();
    component.onContentChange('Texto sin título');

    component.requestClose();

    expect(component.pendingDiscard()).toBe(true);
    expect(component.editorOpen()).toBe(true);

    component.cancelDiscard();
    expect(component.pendingDiscard()).toBe(false);
    expect(component.editorOpen()).toBe(true);

    component.requestClose();
    component.discardAndClose();
    expect(component.editorOpen()).toBe(false);
  });

  it('guarda al cerrar el editor y luego se cierra', () => {
    service.updateNote.mockReturnValue(
      of(makeNote({ id: 3, title: 'Álgebra', content: 'Álgebra lineal' })),
    );

    component.openEditor(component.notes()[2]);
    component.onContentChange('Álgebra lineal');
    component.requestClose();

    expect(service.updateNote).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(component.editorOpen()).toBe(false);
  });

  it('cuenta palabras y formatea fechas relativas', () => {
    expect(component.countWords('  uno  dos   tres ')).toBe(3);
    expect(component.countWords('')).toBe(0);

    const now = Date.now();
    expect(component.relativeTime(new Date(now - 30_000).toISOString())).toBe('hace un momento');
    expect(component.relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('hace 3 h');
  });
});
