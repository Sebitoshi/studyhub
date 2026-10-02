import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
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
function buildFileForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file, file.name);
  return form;
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
   * Genera flashcards a partir de un documento (PDF/DOCX/TXT). El backend extrae el
   * texto del archivo y la IA construye las tarjetas solo con ese material.
   */
  generateFlashcardsFromFile(
    file: File,
    data: { topic?: string; count?: number } = {},
  ): Observable<{ flashcards: Flashcard[]; source?: { filename: string; characters: number } }> {
    return this.http
      .post<{ flashcards: Flashcard[]; source?: { filename: string; characters: number } }>(
        `${API}/ai/flashcards/file${buildQuery({ topic: data.topic, count: data.count })}`,
        buildFileForm(file),
      )
      .pipe(tap(() => AppCache.invalidate('ai_flashcards')));
  }

  /**
   * Genera un simulacro (o quiz) a partir de un documento subido. Con
   * `origin: 'SIMULACRO'` el recurso queda marcado como examen cronometrado y no
   * aparece en la zona de quizzes.
   */
  generateQuizFromFile(
    file: File,
    data: { difficulty?: string; count?: number; origin?: 'QUIZ' | 'SIMULACRO' } = {},
  ): Observable<{ resource: GeneratedResource; source?: { filename: string; characters: number; topic: string } }> {
    return this.http
      .post<{ resource: GeneratedResource; source?: { filename: string; characters: number; topic: string } }>(
        `${API}/ai/resources/quiz/file${buildQuery({
          origin: data.origin || 'SIMULACRO',
          difficulty: data.difficulty,
          count: data.count,
        })}`,
        buildFileForm(file),
      )
      .pipe(tap(() => AppCache.invalidatePrefix('ai_resources')));
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
