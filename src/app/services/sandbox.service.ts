import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

export type SandboxLanguage = 'java' | 'python' | 'javascript' | 'sql';

export interface SandboxTest {
  id: string;
  label: string;
  stdin: string;
  expected: string;
}

export interface SandboxExercise {
  id: string;
  title: string;
  language: SandboxLanguage;
  description: string;
  code: string;
  tests: SandboxTest[];
  createdAt: string;
  updatedAt: string;
  /** id numérico en el backend (si se pudo sincronizar). */
  backendId?: number;
}

export interface SandboxAttempt {
  id: string;
  exerciseId: string | null;
  language: SandboxLanguage;
  code: string;
  output: string;
  passed: boolean;
  testedCases: number;
  passedCases: number;
  createdAt: string;
  backendId?: number;
}

export interface SandboxResult {
  ok: boolean;
  output: string;
  error: string;
  compileError: string;
  status: string;
}

export interface SandboxStats {
  attempts: number;
  passed: number;
  exercisesSaved: number;
}

/** Configuración de cada lenguaje soportado por el sandbox. */
export interface SandboxLanguageInfo {
  id: SandboxLanguage;
  label: string;
  color: string;
  /** Compilador/ejecutor de Wandbox. */
  wandboxCompiler: string | null;
  /** Plantilla inicial de código. */
  template: string;
  /** Nombre de archivo enviado a Wandbox. */
  fileName: string;
  hint: string;
}

export const SANDBOX_LANGUAGES: SandboxLanguageInfo[] = [
  {
    id: 'python',
    label: 'Python',
    color: '#3572A5',
    wandboxCompiler: 'cpython-3.10.15',
    fileName: 'main.py',
    template: '# Escribe tu código Python aquí\ndef main():\n    print("¡Hola, StudyHub!")\n\nif __name__ == "__main__":\n    main()\n',
    hint: 'Usa input() o lee de sys.stdin para probar casos de entrada.',
  },
  {
    id: 'java',
    label: 'Java',
    color: '#B07219',
    wandboxCompiler: 'openjdk-jdk-21+35',
    fileName: 'prog.java',
    template: 'public class prog {\n    public static void main(String[] args) {\n        System.out.println("¡Hola, StudyHub!");\n    }\n}\n',
    hint: 'La clase principal debe llamarse prog (así lo espera el ejecutor). Usa Scanner(System.in) para entrada.',
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    color: '#F7DF1E',
    wandboxCompiler: 'nodejs-20.17.0',
    fileName: 'main.js',
    template: '// Escribe tu código JavaScript (Node.js) aquí\nconsole.log("¡Hola, StudyHub!");\n',
    hint: 'Se ejecuta con Node.js. Usa readline o process.stdin para entrada.',
  },
  {
    id: 'sql',
    label: 'SQL',
    color: '#003B57',
    wandboxCompiler: 'sqlite-3.46.1',
    fileName: 'main.sql',
    template: "-- Escribe consultas SQL (SQLite)\nCREATE TABLE estudiantes (id INTEGER PRIMARY KEY, nombre TEXT);\nINSERT INTO estudiantes (nombre) VALUES ('Ana');\nSELECT * FROM estudiantes;\n",
    hint: 'Se ejecuta con SQLite. Puedes crear tablas, insertar datos y consultar.',
  },
];

const STORAGE_EXERCISES = 'studyhub_sandbox_exercises';
const STORAGE_ATTEMPTS = 'studyhub_sandbox_attempts';

const WANDBOX_API = 'https://wandbox.org/api/compile.json';
const API = 'https://study-hub-backend-sigma.vercel.app';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

@Injectable({ providedIn: 'root' })
export class SandboxService {
  // ── Estado reactivo ──
  exercises = signal<SandboxExercise[]>([]);
  attempts = signal<SandboxAttempt[]>([]);
  running = signal(false);
  lastResult = signal<SandboxResult | null>(null);

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  constructor() {
    this.loadExercises();
    this.loadAttempts();
    this.syncFromBackend(); // fire & forget
  }

  /** Devuelve la info de un lenguaje o el primero por defecto. */
  languageInfo(id: string): SandboxLanguageInfo {
    return SANDBOX_LANGUAGES.find((l) => l.id === id) ?? SANDBOX_LANGUAGES[0];
  }

  /**
   * Ejecuta código enviándolo a Wandbox (API pública, CORS abierto).
   */
  async execute(language: SandboxLanguage, code: string, stdin = ''): Promise<SandboxResult> {
    this.running.set(true);
    try {
      const info = this.languageInfo(language);

      // Nota: para Java, Wandbox guarda el archivo como prog.java, por lo que la
      // clase principal debe llamarse prog (no Main). Se envía en 'code' directo.
      // Además, normalizamos los ejercicios viejos que usaban "class Main".
      const body: Record<string, unknown> = {
        compiler: info.wandboxCompiler,
        stdin,
        code: language === 'java' ? code.replace(/\bclass\s+Main\b/g, 'class prog') : code,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const res = await fetch(WANDBOX_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const result: SandboxResult = { ok: false, output: '', error: `Error del ejecutor (${res.status}): ${text.slice(0, 300)}`, compileError: '', status: String(res.status) };
        this.lastResult.set(result);
        return result;
      }

      const data = await res.json();
      const output = data.program_output || '';
      const error = data.program_error || '';
      const compileError = data.compiler_error || '';
      const status = String(data.status ?? '0');
      const result: SandboxResult = {
        ok: status === '0' && !compileError && !error,
        output,
        error,
        compileError,
        status,
      };
      this.lastResult.set(result);
      return result;
    } catch (e) {
      const result: SandboxResult = {
        ok: false,
        output: '',
        error: e instanceof Error && e.name === 'AbortError'
          ? 'La ejecución tardó demasiado (60s máx).'
          : 'No se pudo conectar con el ejecutor de código. Revisa tu conexión.',
        compileError: '',
        status: '-1',
      };
      this.lastResult.set(result);
      return result;
    } finally {
      this.running.set(false);
    }
  }

  /** Ejecuta código contra un caso de prueba y compara la salida. */
  async runTest(language: SandboxLanguage, code: string, test: SandboxTest): Promise<{ passed: boolean; actual: string }> {
    const res = await this.execute(language, code, test.stdin);
    const actual = (res.output || '').trim();
    const expected = (test.expected || '').trim();
    return { passed: res.ok && actual === expected, actual };
  }

  // ───────────── Sincronización con el backend ─────────────

  private hasSession(): boolean {
    return (
      isPlatformBrowser(this.platformId) &&
      !!(localStorage.getItem('access_token') || localStorage.getItem('refresh_token'))
    );
  }

  /**
   * Carga ejercicios e intentos desde el backend si hay sesión y la API
   * responde. Mezcla con el estado local: los elementos creados localmente
   * sin backendId se conservan y se reintentan subir. Si la API falla
   * (no desplegada / sin red), se conserva el almacenamiento local.
   */
  private async syncFromBackend(): Promise<void> {
    if (!this.hasSession()) return;
    try {
      const [remoteExercises, remoteAttempts] = await Promise.all([
        firstValueFrom(this.http.get<any[]>(`${API}/sandbox/exercises`)),
        firstValueFrom(this.http.get<any[]>(`${API}/sandbox/attempts`)),
      ]);

      const remoteEx = new Map<number, SandboxExercise>();
      for (const e of remoteExercises || []) {
        const id = Number(e.id);
        remoteEx.set(id, {
          id: String(id),
          backendId: id,
          title: e.title || 'Sin título',
          language: e.language || 'python',
          description: e.description || '',
          code: e.code || '',
          tests: Array.isArray(e.tests) ? e.tests : [],
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        });
      }

      // Merge: remotos primero, luego los locales sin backendId (no perdidos).
      const mergedExercises: SandboxExercise[] = [...remoteEx.values()];
      for (const local of this.exercises()) {
        if (!local.backendId && !mergedExercises.some((m) => m.id === local.id)) {
          mergedExercises.push(local);
          // Reintentar subir el ejercicio local al backend.
          this.pushExerciseToBackend(local, 'create');
        }
      }
      this.exercises.set(mergedExercises);
      this.persistExercises();

      const remoteAt = new Map<number, SandboxAttempt>();
      for (const a of remoteAttempts || []) {
        const id = Number(a.id);
        remoteAt.set(id, {
          id: String(id),
          backendId: id,
          exerciseId: a.exerciseId != null ? String(a.exerciseId) : null,
          language: a.language || 'python',
          code: a.code || '',
          output: a.output || '',
          passed: !!a.passed,
          testedCases: a.testedCases ?? 0,
          passedCases: a.passedCases ?? 0,
          createdAt: a.createdAt,
        });
      }
      const mergedAttempts: SandboxAttempt[] = [...remoteAt.values()];
      for (const local of this.attempts()) {
        if (!local.backendId && !mergedAttempts.some((m) => m.id === local.id)) {
          mergedAttempts.push(local);
        }
      }
      this.attempts.set(mergedAttempts);
      this.persistAttempts();
    } catch {
      // API no disponible → se mantiene el estado local.
    }
  }

  // ───────────── Ejercicios ─────────────

  private loadExercises(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      this.exercises.set(JSON.parse(localStorage.getItem(STORAGE_EXERCISES) || '[]'));
    } catch {
      this.exercises.set([]);
    }
  }

  private persistExercises(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_EXERCISES, JSON.stringify(this.exercises()));
  }

  saveExercise(data: Omit<SandboxExercise, 'id' | 'createdAt' | 'updatedAt'>): SandboxExercise {
    const now = new Date().toISOString();
    const ex: SandboxExercise = { ...data, id: uid(), createdAt: now, updatedAt: now };
    this.exercises.update((list) => [ex, ...list]);
    this.persistExercises();
    this.pushExerciseToBackend(ex, 'create');
    return ex;
  }

  updateExercise(id: string, patch: Partial<SandboxExercise>): void {
    this.exercises.update((list) => list.map((e) =>
      e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
    ));
    this.persistExercises();
    const ex = this.exercises().find((e) => e.id === id);
    if (ex?.backendId) this.pushExerciseToBackend(ex, 'update');
  }

  deleteExercise(id: string): void {
    const ex = this.exercises().find((e) => e.id === id);
    this.exercises.update((list) => list.filter((e) => e.id !== id));
    this.persistExercises();
    if (ex?.backendId && this.hasSession()) {
      firstValueFrom(this.http.delete(`${API}/sandbox/exercises/${ex.backendId}`)).catch(() => null);
    }
  }

  /** Crea o actualiza un ejercicio en el backend (silencioso si falla). */
  private pushExerciseToBackend(ex: SandboxExercise, mode: 'create' | 'update'): void {
    if (!this.hasSession()) return;
    const payload = {
      title: ex.title,
      language: ex.language,
      description: ex.description,
      code: ex.code,
      tests: ex.tests,
    };
    const request = mode === 'create'
      ? this.http.post<any>(`${API}/sandbox/exercises`, payload)
      : this.http.put<any>(`${API}/sandbox/exercises/${ex.backendId}`, payload);

    firstValueFrom(request)
      .then((res: any) => {
        if (mode === 'create' && res?.id && !ex.backendId) {
          this.exercises.update((list) => list.map((e) =>
            e.id === ex.id ? { ...e, backendId: Number(res.id) } : e
          ));
          this.persistExercises();
        }
      })
      .catch(() => null);
  }

  // ───────────── Intentos y progreso ─────────────

  private loadAttempts(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      this.attempts.set(JSON.parse(localStorage.getItem(STORAGE_ATTEMPTS) || '[]'));
    } catch {
      this.attempts.set([]);
    }
  }

  private persistAttempts(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_ATTEMPTS, JSON.stringify(this.attempts()));
  }

  recordAttempt(data: Omit<SandboxAttempt, 'id' | 'createdAt'>): SandboxAttempt {
    const attempt: SandboxAttempt = { ...data, id: uid(), createdAt: new Date().toISOString() };
    this.attempts.update((list) => [attempt, ...list].slice(0, 100));
    this.persistAttempts();
    // Registrar en el backend (silencioso si falla), vinculando al ejercicio real.
    if (this.hasSession()) {
      const linked = data.exerciseId
        ? (this.exercises().find((e) => e.id === data.exerciseId)?.backendId ?? Number(data.exerciseId)) || null
        : null;
      firstValueFrom(this.http.post(`${API}/sandbox/attempts`, {
        exerciseId: linked,
        language: attempt.language,
        code: attempt.code,
        output: attempt.output,
        passed: attempt.passed,
        testedCases: attempt.testedCases,
        passedCases: attempt.passedCases,
      })).catch(() => null);
    }
    return attempt;
  }

  clearAttempts(): void {
    this.attempts.set([]);
    this.persistAttempts();
    if (this.hasSession()) {
      firstValueFrom(this.http.delete(`${API}/sandbox/attempts`)).catch(() => null);
    }
  }

  attemptsForExercise(exerciseId: string): SandboxAttempt[] {
    return this.attempts().filter((a) => a.exerciseId === exerciseId);
  }

  stats(): SandboxStats {
    const attempts = this.attempts();
    return {
      attempts: attempts.length,
      passed: attempts.filter((a) => a.passed).length,
      exercisesSaved: this.exercises().length,
    };
  }
}
