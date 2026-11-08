import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  SandboxService, SandboxLanguage, SandboxExercise, SandboxTest, SANDBOX_LANGUAGES, passes,
} from '../../services/sandbox.service';
import { LangIconComponent } from './lang-icon.component';
import { EXERCISE_BANK, BankExercise, SandboxLevel } from '../../services/sandbox-bank';

type Panel = 'run' | 'tests' | 'saved' | 'progress';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-laboratorio',
  standalone: true,
  imports: [SidebarComponent, FormsModule, CommonModule, LangIconComponent, PageHeaderComponent],
  templateUrl: './laboratorio.component.html',
  styles: [`:host { display: contents; }`],
})
export class LaboratorioComponent implements OnInit {
  protected sandbox = inject(SandboxService);
  protected languages = SANDBOX_LANGUAGES;

  // Editor
  language = signal<SandboxLanguage>('python');
  code = '';
  stdin = '';

  // UI
  activePanel = signal<Panel>('run');
  running = signal(false);
  testResults: Record<string, { passed: boolean; actual: string }> = {};
  allTestsPassed = false;

  // Guardar / cargar ejercicios
  saveOpen = false;
  exerciseTitle = '';
  exerciseDescription = '';
  savedFlash = false;

  // Comparar intentos
  comparingId: string | null = null;
  compareOpen = false;

  ngOnInit(): void {
    // Plantilla inicial según el lenguaje por defecto.
    this.code = this.sandbox.languageInfo('python').template;
    this.activePanel.set('run');
  }

  langInfo(id: string) {
    return this.sandbox.languageInfo(id);
  }

  setPanel(p: string): void {
    this.activePanel.set(p as Panel);
  }

  selectLanguage(id: string): void {
    this.language.set(id as SandboxLanguage);
    this.activeBankId.set(null);
    this.hintOpen.set(false);
    // Cambiar de lenguaje conserva el código solo si está vacío o es la plantilla anterior.
    const info = this.sandbox.languageInfo(id);
    const isBlank = !this.code.trim() || SANDBOX_LANGUAGES.some((l) => l.template.trim() === this.code.trim());
    if (isBlank) this.code = info.template;
    this.activePanel.set('run');
    this.testResults = {};
    this.allTestsPassed = false;
  }

  async run(): Promise<void> {
    this.running.set(true);
    this.allTestsPassed = false;
    this.testResults = {};
    try {
      const language = this.language();
      const tests = this.exerciseTests().filter((t) => t.expected.trim() !== '');
      let passed: boolean;
      let testedCases = 0;
      let passedCases = 0;
      let output = '';

      if (tests.length === 0) {
        // Sin casos: una sola ejecución con el stdin del panel.
        const result = await this.sandbox.execute(language, this.code, this.stdin);
        passed = result.ok;
        output = result.output;
      } else {
        // Con casos: una tanda en paralelo; no se ejecuta dos veces lo mismo.
        const results = await this.sandbox.executeBatch(language, this.code, tests.map((t) => t.stdin));
        const outcomes: Record<string, { passed: boolean; actual: string }> = {};
        results.forEach((result, i) => {
          const test = tests[i];
          outcomes[test.id] = { passed: passes(result, test), actual: (result.output || '').trim() };
        });
        this.testResults = outcomes;
        testedCases = tests.length;
        passedCases = Object.values(outcomes).filter((o) => o.passed).length;
        this.allTestsPassed = passedCases === testedCases;
        passed = this.allTestsPassed;
        output = results.map((r) => (r.output || '').trim()).join('\n');
        // La pestaña Salida muestra el caso que coincide con el stdin escrito.
        const current = tests.findIndex((t) => t.stdin === this.stdin);
        this.sandbox.lastResult.set(results[current >= 0 ? current : 0] ?? null);
        this.activePanel.set('tests');
      }

      this.sandbox.recordAttempt({
        exerciseId: this.currentExerciseId(),
        language,
        code: this.code,
        output,
        passed,
        testedCases,
        passedCases,
      });
      if (tests.length === 0) this.activePanel.set('run');
    } finally {
      this.running.set(false);
    }
  }

  // ───────────── Casos de prueba ─────────────
  newTestCase(): void {
    this.exerciseTests.update((tests) => [
      ...tests,
      { id: 't' + Date.now().toString(36), label: `Caso ${tests.length + 1}`, stdin: '', expected: '' },
    ]);
  }

  removeTestCase(id: string): void {
    this.exerciseTests.update((tests) => tests.filter((t) => t.id !== id));
    delete this.testResults[id];
  }

  async runTests(): Promise<void> {
    this.running.set(true);
    this.allTestsPassed = false;
    this.testResults = {};
    try {
      const tests = this.exerciseTests().filter((t) => t.expected.trim() !== '');
      if (tests.length === 0) {
        this.activePanel.set('tests');
        return;
      }
      // Los casos se ejecutan en paralelo (máx. 4 a la vez) y con caché.
      const results = await this.sandbox.executeBatch(this.language(), this.code, tests.map((t) => t.stdin));
      const outcomes: Record<string, { passed: boolean; actual: string }> = {};
      results.forEach((result, i) => {
        const test = tests[i];
        outcomes[test.id] = { passed: passes(result, test), actual: (result.output || '').trim() };
      });
      this.testResults = outcomes;
      const passedCases = Object.values(outcomes).filter((o) => o.passed).length;
      this.allTestsPassed = passedCases === tests.length;
      this.sandbox.recordAttempt({
        exerciseId: this.currentExerciseId(),
        language: this.language(),
        code: this.code,
        output: results.map((r) => (r.output || '').trim()).join('\n'),
        passed: this.allTestsPassed,
        testedCases: tests.length,
        passedCases,
      });
      this.activePanel.set('tests');
    } finally {
      this.running.set(false);
    }
  }

  testPassed(id: string): boolean | null {
    const r = this.testResults[id];
    if (!r) return null;
    return r.passed;
  }

  hasTestResults(): boolean {
    return Object.keys(this.testResults).length > 0;
  }

  // ───────────── Ejercicios guardados (modo edición) ─────────────
  exerciseTests = signal<SandboxTest[]>([]);
  editingId: string | null = null;

  openSave(): void {
    this.saveOpen = true;
    this.exerciseTitle = this.editingId
      ? this.sandbox.exercises().find((e) => e.id === this.editingId)?.title ?? ''
      : '';
    this.exerciseDescription = this.editingId
      ? this.sandbox.exercises().find((e) => e.id === this.editingId)?.description ?? ''
      : '';
    this.exerciseTests.set(this.editingId
      ? this.sandbox.exercises().find((e) => e.id === this.editingId)?.tests ?? []
      : []);
    if (this.exerciseTests().length === 0) {
      this.exerciseTests.set([{ id: 't' + Date.now().toString(36), label: 'Caso 1', stdin: '', expected: '' }]);
    }
  }

  closeSave(): void {
    this.saveOpen = false;
    this.editingId = null;
  }

  confirmSave(): void {
    if (!this.exerciseTitle.trim()) return;
    const payload = {
      title: this.exerciseTitle.trim(),
      language: this.language(),
      description: this.exerciseDescription.trim(),
      code: this.code,
      tests: this.exerciseTests().filter((t) => t.expected.trim() !== ''),
    };
    if (this.editingId) {
      this.sandbox.updateExercise(this.editingId, payload);
    } else {
      this.sandbox.saveExercise(payload);
    }
    this.closeSave();
    this.savedFlash = true;
    setTimeout(() => (this.savedFlash = false), 2200);
    this.activePanel.set('saved');
  }

  loadExercise(id: string): void {
    const ex = this.sandbox.exercises().find((e) => e.id === id);
    if (!ex) return;
    this.activeBankId.set(null);
    this.hintOpen.set(false);
    this.language.set(ex.language);
    this.code = ex.code;
    this.exerciseTests.set([...(ex.tests || [])]);
    this.testResults = {};
    this.allTestsPassed = false;
    this.activePanel.set('run');
  }

  editExercise(id: string): void {
    this.editingId = id;
    this.openSave();
  }

  deleteExercise(id: string): void {
    this.sandbox.deleteExercise(id);
    if (this.editingId === id) this.editingId = null;
  }

  // ───────────── Banco de ejercicios ─────────────
  readonly levels = ['Todos', 'Básico', 'Intermedio', 'Avanzado'] as const;
  bankLang = signal<'java' | 'javascript'>('java');
  bankLevel = signal<(typeof this.levels)[number]>('Todos');
  activeBankId = signal<string | null>(null);
  /** Si la pista del ejercicio activo está visible. */
  hintOpen = signal(false);

  /** Buscador del banco (título, tema o enunciado). */
  bankQuery = signal('');
  /** Ejercicio cuya pista se muestra dentro de su tarjeta. */
  cardHintId = signal<string | null>(null);

  readonly bankFiltered = computed(() => {
    const query = this.bankQuery().trim().toLowerCase();
    return EXERCISE_BANK.filter((ex) => {
      if (ex.language !== this.bankLang()) return false;
      if (this.bankLevel() !== 'Todos' && ex.level !== this.bankLevel()) return false;
      if (!query) return true;
      return `${ex.title} ${ex.topic} ${ex.description}`.toLowerCase().includes(query);
    });
  });

  /** Ejercicios del lenguaje elegido (sin contar el filtro de nivel ni la búsqueda). */
  readonly bankLanguageTotal = computed(
    () => EXERCISE_BANK.filter((ex) => ex.language === this.bankLang()).length,
  );
  readonly bankSolvedCount = computed(
    () => EXERCISE_BANK.filter((ex) => ex.language === this.bankLang() && this.bankSolved(ex.id)).length,
  );

  readonly activeBank = computed<BankExercise | null>(
    () => EXERCISE_BANK.find((ex) => ex.id === this.activeBankId()) ?? null,
  );

  setBankLanguage(language: 'java' | 'javascript'): void {
    this.bankLang.set(language);
    this.cardHintId.set(null);
  }

  /** Muestra u oculta la pista dentro de la tarjeta, sin cargar el ejercicio. */
  toggleCardHint(id: string): void {
    this.cardHintId.update((current) => (current === id ? null : id));
  }

  setBankLevel(level: (typeof this.levels)[number]): void {
    this.bankLevel.set(level);
  }

  /** Muestra u oculta la pista del ejercicio del banco cargado. */
  toggleHint(): void {
    this.hintOpen.update((open) => !open);
  }

  /** Atajo Ctrl/Cmd + Enter para ejecutar sin salir del editor. */
  runShortcut(event: Event): void {
    event.preventDefault();
    if (!this.running()) void this.run();
  }

  /** Devuelve el editor al código inicial del ejercicio (o a la plantilla del lenguaje). */
  resetCode(): void {
    const bank = this.activeBank();
    this.code = bank ? bank.starterCode : this.sandbox.languageInfo(this.language()).template;
    this.testResults = {};
    this.allTestsPassed = false;
  }

  fmtMs(ms: number): string {
    return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
  }

  /** Color de la franja de nivel en las tarjetas del banco. */
  levelColor(level: SandboxLevel): string {
    if (level === 'Básico') return '#10b981';
    if (level === 'Intermedio') return '#f59e0b';
    return '#f43f5e';
  }

  /** Carga un ejercicio del banco en el editor con sus casos de prueba. */
  startBankExercise(ex: BankExercise): void {
    this.activeBankId.set(ex.id);
    this.hintOpen.set(false);
    this.editingId = null;
    this.selectLanguage(ex.language);
    this.activeBankId.set(ex.id);
    this.code = ex.starterCode;
    this.exerciseTests.set(ex.tests.map((t) => ({ ...t })));
    this.testResults = {};
    this.allTestsPassed = false;
    this.stdin = ex.tests[0]?.stdin ?? '';
    this.activePanel.set('run');
  }

  /** Intentos del ejercicio del banco cargado. */
  bankAttempts(id: string): number {
    return this.sandbox.attemptsForExercise(`bank:${id}`).length;
  }

  bankSolved(id: string): boolean {
    return this.sandbox.attemptsForExercise(`bank:${id}`).some((a) => a.passed);
  }

  private currentExerciseId(): string | null {
    const bankId = this.activeBankId();
    return bankId ? `bank:${bankId}` : this.editingId;
  }

  // ───────────── Comparar intentos ─────────────
  openCompare(id: string): void {
    this.comparingId = id;
    this.compareOpen = true;
  }

  closeCompare(): void {
    this.compareOpen = false;
    this.comparingId = null;
  }

  attemptsFor(exerciseId: string) {
    return this.sandbox.attemptsForExercise(exerciseId);
  }

  restoreAttempt(attempt: { code: string; language: SandboxLanguage }): void {
    this.language.set(attempt.language);
    this.code = attempt.code;
    this.compareOpen = false;
    this.comparingId = null;
    this.activePanel.set('run');
  }

  fmtDate(iso: string): string {
    return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
