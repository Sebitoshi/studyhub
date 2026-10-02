import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  SandboxService, SandboxLanguage, SandboxExercise, SandboxTest, SANDBOX_LANGUAGES,
} from '../../services/sandbox.service';
import { LangIconComponent } from './lang-icon.component';

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

  @ViewChild('htmlFrame') htmlFrame?: ElementRef<HTMLIFrameElement>;

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
      if (this.language() === 'html') {
        // Render HTML en iframe después de un tick.
        setTimeout(() => {
          const frame = this.htmlFrame?.nativeElement;
          if (frame) {
            frame.srcdoc = this.code;
            frame.contentWindow?.location.reload();
          }
        });
        this.sandbox.lastResult.set({ ok: true, output: '', error: '', compileError: '', status: '0' });
        this.sandbox.recordAttempt({
          exerciseId: this.editingId,
          language: this.language(),
          code: this.code,
          output: '(vista previa HTML)',
          passed: true,
          testedCases: 0,
          passedCases: 0,
        });
      } else {
        await this.sandbox.execute(this.language(), this.code, this.stdin);
        const r = this.sandbox.lastResult();
        if (r) {
          // Si hay casos definidos, correlos para evaluar el intento.
          let testedCases = 0;
          let passedCases = 0;
          let passed = r.ok;
          const tests = this.exerciseTests().filter((t) => t.expected.trim() !== '');
          if (tests.length > 0) {
            const results: Record<string, { passed: boolean; actual: string }> = {};
            for (const t of tests) {
              const { passed: p, actual } = await this.sandbox.runTest(this.language(), this.code, t);
              results[t.id] = { passed: p, actual };
              testedCases++;
              if (p) passedCases++;
            }
            this.testResults = results;
            this.allTestsPassed = passedCases === testedCases && testedCases > 0;
            passed = this.allTestsPassed;
            this.activePanel.set('tests');
          }
          this.sandbox.recordAttempt({
            exerciseId: this.editingId,
            language: this.language(),
            code: this.code,
            output: r.output,
            passed,
            testedCases,
            passedCases,
          });
        }
      }
      if (this.activePanel() !== 'tests') this.activePanel.set('run');
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
      let passedCases = 0;
      for (const t of tests) {
        const { passed, actual } = await this.sandbox.runTest(this.language(), this.code, t);
        this.testResults[t.id] = { passed, actual };
        if (passed) passedCases++;
      }
      this.allTestsPassed = passedCases === tests.length;
      this.sandbox.recordAttempt({
        exerciseId: this.editingId,
        language: this.language(),
        code: this.code,
        output: Object.values(this.testResults).map((r) => r.actual).join('\n'),
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
