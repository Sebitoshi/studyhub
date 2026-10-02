import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, concatMap, from, last, map, of, retry, switchMap, tap, throwError, timer } from 'rxjs';
import { AppCache } from '../utils/cache';

export interface TeacherProfile {
  code: string;
  name: string;
  description: string;
  subjects: string[];
  systemPrompt: string;
  teachingStyle: string;
  difficultyLevel: string;
  active: boolean;
  isSystem?: boolean;
  _id?: string;
}

export interface Conversation {
  _id: string;
  userId: number;
  title: string | null;
  description: string | null;
  lastMessageAt: string;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  userId: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface KnowledgeGap {
  _id: string;
  userId: number;
  topic: string;
  subject: string;
  confidence: number;
  status: string;
  evidence: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LearningGoal {
  _id: string;
  userId: number;
  title: string;
  description: string;
  progress: number;
  status: string;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatResponse {
  reply: string;
  conversationId: string;
}

export interface GeneratedResource {
  id: string;
  userId: number;
  subject: string;
  type: string;
  title: string;
  difficulty: string | null;
  generatedFrom: string | null;
  completed: boolean;
  completedAt: string | null;
  resultScore: number | null;
  resultCorrect: number | null;
  resultTotal: number | null;
  trigger: string | null;
  createdAt: string;
  content?: any;
}

export interface Flashcard {
  /** Id del recurso generado en el backend (se usa para eliminar la tarjeta). */
  id: string;
  question: string;
  answer: string;
  hint?: string | null;
  topic?: string;
  subject?: string;
  createdAt?: string;
}

export interface QuizQuestion {
  question: string;
  choices: string[];
  answer: string;
  explanation?: string;
  difficulty?: string;
}

export interface QuizContent {
  type: string;
  topic: string;
  subject: string;
  quiz: QuizQuestion[];
}

const API = 'https://study-hub-backend-sigma.vercel.app'!;

/**
 * Tamaño de cada trozo al subir un documento. Debe quedar por debajo del límite de
 * cuerpo de petición del backend (~4.5 MB), que es lo que limita el tamaño del PDF.
 */
const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

/** Arma el query string omitiendo los valores vacíos. */
function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && String(value).length > 0,
  );
  if (!entries.length) return '';
  return `?${entries.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join('&')}`;
}

/**
 * FormData con el archivo. Angular fija el `Content-Type: multipart/form-data`
 * automáticamente (con su boundary), por eso no se envía a mano.
 */
function buildFileForm(blob: Blob, filename: string): FormData {
  const form = new FormData();
  form.append('file', blob, filename);
  return form;
}

/**
 * Errores que vale la pena repetir en una subida: red caída (status 0) o fallos
 * transitorios del servidor. Bajo carga Vercel puede contestar 503 sin llegar a
 * invocar la función, y repetir el trozo es inocuo (se guarda otra vez el mismo índice).
 */
function isTransientUploadError(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  return error.status === 0 || [408, 429, 502, 503, 504].includes(error.status);
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private http = inject(HttpClient);

  getTeacherProfiles(forceRefresh = false): Observable<{ profiles: TeacherProfile[] }> {
    if (!forceRefresh) {
      const cached = AppCache.get<{ profiles: TeacherProfile[] }>('ai_teacher_profiles');
      if (cached) return of(cached);
    }
    return this.http.get<{ profiles: TeacherProfile[] }>(`${API}/ai/teacher-profiles`).pipe(
      tap(data => AppCache.set('ai_teacher_profiles', data))
    );
  }

  createTeacherProfile(data: Partial<TeacherProfile>): Observable<{ profile: TeacherProfile }> {
    return this.http.post<{ profile: TeacherProfile }>(`${API}/ai/teacher-profiles`, data).pipe(
      tap(() => AppCache.invalidate('ai_teacher_profiles'))
    );
  }

  createConversation(): Observable<Conversation> {
    return this.http.post<Conversation>(`${API}/ai/conversations`, {}).pipe(
      tap(() => AppCache.invalidate('ai_conversations'))
    );
  }

  getConversations(forceRefresh = false): Observable<{ conversations: Conversation[]; total: number; page: number; limit: number }> {
    if (!forceRefresh) {
      const cached = AppCache.get<{ conversations: Conversation[]; total: number; page: number; limit: number }>('ai_conversations');
      if (cached) return of(cached);
    }
    return this.http.get<{ conversations: Conversation[]; total: number; page: number; limit: number }>(
      `${API}/ai/conversations`
    ).pipe(
      tap(data => AppCache.set('ai_conversations', data))
    );
  }

  getConversation(id: string, forceRefresh = false): Observable<{ conversation: Conversation; messages: Message[] }> {
    const key = `ai_conversation_${id}`;
    if (!forceRefresh) {
      const cached = AppCache.get<{ conversation: Conversation; messages: Message[] }>(key);
      if (cached) return of(cached);
    }
    return this.http.get<{ conversation: Conversation; messages: Message[] }>(`${API}/ai/conversations/${id}`).pipe(
      tap(data => AppCache.set(key, data))
    );
  }

  getConversationMessages(id: string): Observable<{ messages: Message[] }> {
    return this.http.get<{ messages: Message[] }>(`${API}/ai/conversations/${id}/messages`);
  }

  deleteConversation(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/ai/conversations/${id}`).pipe(
      tap(() => {
        AppCache.invalidate('ai_conversations');
        AppCache.invalidate(`ai_conversation_${id}`);
      })
    );
  }

  sendMessage(message: string, conversationId?: string, teacherId?: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${API}/ai/chat`, {
      conversationId: conversationId || undefined,
      teacherId,
      message,
    }).pipe(
      tap(() => {
        if (conversationId) AppCache.invalidate(`ai_conversation_${conversationId}`);
        AppCache.invalidate('ai_conversations');
      })
    );
  }

  getKnowledgeGaps(forceRefresh = false): Observable<{ gaps: KnowledgeGap[] }> {
    if (!forceRefresh) {
      const cached = AppCache.get<{ gaps: KnowledgeGap[] }>('ai_knowledge_gaps');
      if (cached) return of(cached);
    }
    return this.http.get<{ gaps: KnowledgeGap[] }>(`${API}/ai/knowledge-gaps`).pipe(
      tap(data => AppCache.set('ai_knowledge_gaps', data))
    );
  }

  updateKnowledgeGap(id: string, data: { status?: string; confidence?: number }): Observable<{ gap: KnowledgeGap }> {
    return this.http.patch<{ gap: KnowledgeGap }>(`${API}/ai/knowledge-gaps/${id}`, data).pipe(
      tap(() => AppCache.invalidate('ai_knowledge_gaps'))
    );
  }

  getGoals(forceRefresh = false): Observable<{ goals: LearningGoal[] }> {
    if (!forceRefresh) {
      const cached = AppCache.get<{ goals: LearningGoal[] }>('ai_goals');
      if (cached) return of(cached);
    }
    return this.http.get<{ goals: LearningGoal[] }>(`${API}/ai/goals`).pipe(
      tap(data => AppCache.set('ai_goals', data))
    );
  }

  createGoal(data: { title: string; description?: string; targetDate?: string }): Observable<{ goal: LearningGoal }> {
    return this.http.post<{ goal: LearningGoal }>(`${API}/ai/goals`, data).pipe(
      tap(() => AppCache.invalidate('ai_goals'))
    );
  }

  updateGoal(id: string, data: { title?: string; description?: string; progress?: number; status?: string; targetDate?: string }): Observable<{ goal: LearningGoal }> {
    return this.http.patch<{ goal: LearningGoal }>(`${API}/ai/goals/${id}`, data).pipe(
      tap(() => AppCache.invalidate('ai_goals'))
    );
  }

  deleteGoal(id: string): Observable<any> {
    return this.http.delete(`${API}/ai/goals/${id}`).pipe(
      tap(() => AppCache.invalidate('ai_goals'))
    );
  }

  getDashboard(forceRefresh = false): Observable<any> {
    if (!forceRefresh) {
      const cached = AppCache.get<any>('ai_dashboard');
      if (cached) return of(cached);
    }
    return this.http.get(`${API}/ai/dashboard`).pipe(
      tap(data => AppCache.set('ai_dashboard', data)  )
    );
  }

  /**
   * Genera un quiz (o un simulacro, con `origin: 'SIMULACRO'`). El origen va como
   * query param para que sea compatible mientras el backend no lo soporte.
   */
  generateQuiz(data: { topic?: string; difficulty?: string; count?: number; origin?: 'QUIZ' | 'SIMULACRO' }): Observable<{ resource: GeneratedResource }> {
    const { origin, ...body } = data;
    const params = origin ? `?origin=${origin}` : '';
    return this.http.post<{ resource: GeneratedResource }>(`${API}/ai/resources/quiz${params}`, body).pipe(
      tap(() => AppCache.invalidatePrefix('ai_resources'))
    );
  }

  /** Lista las flashcards guardadas del estudiante (una entrada por tarjeta). */
  getFlashcards(forceRefresh = false): Observable<{ flashcards: Flashcard[] }> {
    if (!forceRefresh) {
      const cached = AppCache.get<{ flashcards: Flashcard[] }>('ai_flashcards');
      if (cached) return of(cached);
    }
    return this.http.get<{ flashcards: Flashcard[] }>(`${API}/ai/flashcards`).pipe(
      tap(data => AppCache.set('ai_flashcards', data))
    );
  }

  /** Genera flashcards con la IA para el tema indicado (o infiere uno con tus brechas). */
  generateFlashcards(data: { topic?: string; count?: number }): Observable<{ flashcards: Flashcard[] }> {
    return this.http.post<{ flashcards: Flashcard[] }>(`${API}/ai/flashcards`, data).pipe(
      tap(() => AppCache.invalidate('ai_flashcards'))
    );
  }

  /**
   * Sube un documento por partes. Cada trozo va en su propia petición para no chocar
   * con el límite de cuerpo de la plataforma, así que se pueden subir PDFs de
   * cualquier tamaño. `onProgress` informa el porcentaje enviado.
   */
  uploadDocumentInChunks(file: File, onProgress?: (percent: number) => void): Observable<string> {
    if (!file.size) return throwError(() => new Error('El archivo está vacío.'));

    const total = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES));
    const indexes = Array.from({ length: total }, (_, index) => index);
    let uploadId: string | null = null;

    return from(indexes).pipe(
      // concatMap mantiene los trozos en orden y de uno en uno.
      concatMap((index) => {
        const start = index * UPLOAD_CHUNK_BYTES;
        const chunk = file.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, file.size));
        const params = buildQuery({
          uploadId: uploadId || undefined,
          index,
          total,
          filename: file.name,
          mimetype: file.type || 'application/octet-stream',
        });
        return this.http.post<{ uploadId: string }>(`${API}/ai/uploads/chunk${params}`, buildFileForm(chunk, file.name)).pipe(
          // Reintenta el trozo si la red o el gateway fallan de forma transitoria
          // (503 puntual de Vercel, corte de conexión, etc.). Sin esto el usuario
          // ve "Failed to fetch" y la subida entera se aborta.
          retry({
            count: 2,
            delay: (error, retryCount) =>
              isTransientUploadError(error) ? timer(400 * retryCount) : throwError(() => error),
          }),
          tap((res) => {
            uploadId = res.uploadId;
            onProgress?.(Math.round(((index + 1) / total) * 100));
          }),
        );
      }),
      // Sin esto cada trozo emitiría un valor y el recurso se generaría una vez por
      // trozo (tarjetas o preguntas duplicadas). Sólo importa el final de la subida.
      last(),
      map(() => String(uploadId)),
    );
  }

  /** Cancela una subida por partes y descarta los trozos enviados. */
  cancelUpload(uploadId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/ai/uploads/${uploadId}`);
  }

  /**
   * Genera flashcards a partir de un documento (PDF/DOCX/TXT). El documento se sube
   * por partes, el backend extrae el texto y la IA arma las tarjetas con ese material.
   */
  generateFlashcardsFromFile(
    file: File,
    data: { topic?: string; count?: number } = {},
    onProgress?: (percent: number) => void,
  ): Observable<{ flashcards: Flashcard[]; source?: { filename: string; characters: number } }> {
    return this.uploadDocumentInChunks(file, onProgress).pipe(
      switchMap((uploadId) =>
        this.http.post<{ flashcards: Flashcard[]; source?: { filename: string; characters: number } }>(
          `${API}/ai/flashcards/file${buildQuery({ uploadId, topic: data.topic, count: data.count })}`,
          {},
        ),
      ),
      tap(() => AppCache.invalidate('ai_flashcards')),
    );
  }

  /**
   * Genera un simulacro (o quiz) a partir de un documento subido. Con
   * `origin: 'SIMULACRO'` el recurso queda marcado como examen cronometrado y no
   * aparece en la zona de quizzes.
   */
  generateQuizFromFile(
    file: File,
    data: { difficulty?: string; count?: number; origin?: 'QUIZ' | 'SIMULACRO' } = {},
    onProgress?: (percent: number) => void,
  ): Observable<{ resource: GeneratedResource; source?: { filename: string; characters: number; topic: string } }> {
    return this.uploadDocumentInChunks(file, onProgress).pipe(
      switchMap((uploadId) =>
        this.http.post<{ resource: GeneratedResource; source?: { filename: string; characters: number; topic: string } }>(
          `${API}/ai/resources/quiz/file${buildQuery({
            uploadId,
            origin: data.origin || 'SIMULACRO',
            difficulty: data.difficulty,
            count: data.count,
          })}`,
          {},
        ),
      ),
      tap(() => AppCache.invalidatePrefix('ai_resources')),
    );
  }

  /**
   * Lista recursos generados. `scope` separa la zona de Simulacro (`simulacro`) de
   * la de Quiz (`quiz`), para que un simulacro no aparezca entre los quizzes.
   */
  getResources(type?: string, forceRefresh = false, scope?: 'quiz' | 'simulacro'): Observable<{ resources: GeneratedResource[] }> {
    const key = `ai_resources_${type || 'all'}_${scope || 'all'}`;
    if (!forceRefresh) {
      const cached = AppCache.get<{ resources: GeneratedResource[] }>(key);
      if (cached) return of(cached);
    }
    const query = [type ? `type=${type}` : '', scope ? `scope=${scope}` : ''].filter(Boolean).join('&');
    const params = query ? `?${query}` : '';
    return this.http.get<{ resources: GeneratedResource[] }>(`${API}/ai/resources${params}`).pipe(
      tap(data => AppCache.set(key, data))
    );
  }

  getResource(id: string): Observable<{ resource: GeneratedResource }> {
    return this.http.get<{ resource: GeneratedResource }>(`${API}/ai/resources/${id}`);
  }

  completeResource(id: string, data: { resultScore?: number; resultCorrect?: number; resultTotal?: number }): Observable<any> {
    return this.http.patch(`${API}/ai/resources/${id}/complete`, data).pipe(
      tap(() => {
        AppCache.invalidatePrefix('ai_resources');
        AppCache.invalidate('ai_dashboard');
      })
    );
  }

  deleteResource(id: string): Observable<any> {
    return this.http.delete(`${API}/ai/resources/${id}`).pipe(
      tap(() => {
        AppCache.invalidatePrefix('ai_resources');
        AppCache.invalidate('ai_flashcards');
      })
    );
  }

  explainAnswer(data: { question: string; choices: string[]; correctAnswer: string; topic?: string; isCorrect?: boolean }): Observable<{ explanation: string }> {
    return this.http.post<{ explanation: string }>(`${API}/ai/explain-answer`, data);
  }
}
