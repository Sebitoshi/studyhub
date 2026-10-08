import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { AppCache } from '../utils/cache';
import { EventBusService } from './event-bus.service';

export interface SubjectSummary {
  id: number;
  nombre: string;
  codigo?: string;
  profesor?: string;
  salon?: string;
  creditos?: number;
  color: string;
  descripcion?: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  _count: { tasks: number; notes: number; schedules: number };
}

export interface SubjectDetail {
  id: number;
  nombre: string;
  codigo?: string;
  profesor?: string;
  salon?: string;
  creditos?: number;
  color: string;
  descripcion?: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
  schedules: Schedule[];
  tasks: Task[];
  notes: Note[];
}

export interface Schedule {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classroom?: string;
  subjectId: number;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'COMPLETED';
  dueDate: string;
  completedAt?: string | null;
  subjectId: number;
}

export abstract class TaskHelpers {
  static priorityLabel(p: string): string {
    return p === 'HIGH' ? 'Alta' : p === 'MEDIUM' ? 'Media' : 'Baja';
  }

  static priorityBg(p: string): string {
    return p === 'HIGH' ? '#fef2f2' : p === 'MEDIUM' ? '#fffbeb' : '#f1f5f9';
  }

  static priorityColor(p: string): string {
    return p === 'HIGH' ? '#dc2626' : p === 'MEDIUM' ? '#d97706' : '#64748b';
  }
}

export interface Note {
  id: number;
  title: string;
  content: string;
  isPinned: boolean;
  subjectId: number;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SubjectsService {
  private http = inject(HttpClient);
  private events = inject(EventBusService);
  private baseUrl = `${'https://study-hub-backend-sigma.vercel.app'}/subjects`;

  getSubjects(forceRefresh = false): Observable<SubjectSummary[]> {
    if (!forceRefresh) {
      const cached = AppCache.get<SubjectSummary[]>('subjects_list');
      if (cached) return of(cached);
    }
    return this.http.get<SubjectSummary[]>(this.baseUrl).pipe(
      tap(data => AppCache.set('subjects_list', data))
    );
  }

  getSubject(id: number, forceRefresh = false): Observable<SubjectDetail> {
    const key = `subject_${id}`;
    if (!forceRefresh) {
      const cached = AppCache.get<SubjectDetail>(key);
      if (cached) return of(cached);
    }
    return this.http.get<SubjectDetail>(`${this.baseUrl}/${id}`).pipe(
      tap(data => AppCache.set(key, data))
    );
  }

  createSubject(dto: {
    nombre: string;
    codigo?: string;
    profesor?: string;
    salon?: string;
    creditos?: number;
    color: string;
    descripcion?: string;
  }): Observable<SubjectDetail> {
    return this.http.post<SubjectDetail>(this.baseUrl, dto).pipe(
      tap(() => {
        AppCache.invalidate('subjects_list');
        this.events.emit('subject:created');
      })
    );
  }

  deleteSubject(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        AppCache.invalidate('subjects_list');
        AppCache.invalidate(`subject_${id}`);
        this.events.emit('subject:deleted');
      })
    );
  }

  addTask(subjectId: number, dto: {
    title: string;
    description?: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate: string;
  }): Observable<Task> {
    return this.http.post<Task>(`${this.baseUrl}/${subjectId}/tasks`, dto).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        AppCache.invalidate('subjects_list');
        AppCache.invalidate('dashboard');
        this.events.emit('task:created');
      })
    );
  }

  updateTask(subjectId: number, taskId: number, dto: {
    title?: string;
    description?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate?: string;
  }): Observable<Task> {
    return this.http.put<Task>(`${this.baseUrl}/${subjectId}/tasks/${taskId}`, dto).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        AppCache.invalidate('subjects_list');
        AppCache.invalidate('dashboard');
        this.events.emit('task:updated');
      })
    );
  }

  toggleTask(subjectId: number, taskId: number): Observable<Task> {
    return this.http.post<Task>(`${this.baseUrl}/${subjectId}/tasks/${taskId}/toggle`, {}).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        AppCache.invalidate('subjects_list');
        AppCache.invalidate('dashboard');
        this.events.emit('task:toggled');
      })
    );
  }

  deleteTask(subjectId: number, taskId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${subjectId}/tasks/${taskId}`).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        AppCache.invalidate('subjects_list');
        AppCache.invalidate('dashboard');
        this.events.emit('task:deleted');
      })
    );
  }

  addNote(subjectId: number, dto: { title: string; content: string }): Observable<Note> {
    return this.http.post<Note>(`${this.baseUrl}/${subjectId}/notes`, dto).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        AppCache.invalidate('subjects_list');
        this.events.emit('note:created');
      })
    );
  }

  updateNote(subjectId: number, noteId: number, dto: {
    title?: string;
    content?: string;
    isPinned?: boolean;
  }): Observable<Note> {
    return this.http.put<Note>(`${this.baseUrl}/${subjectId}/notes/${noteId}`, dto).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        this.events.emit('note:updated');
      })
    );
  }

  togglePinNote(subjectId: number, noteId: number): Observable<Note> {
    return this.http.post<Note>(`${this.baseUrl}/${subjectId}/notes/${noteId}/pin`, {}).pipe(
      tap(() => AppCache.invalidate(`subject_${subjectId}`))
    );
  }

  deleteNote(subjectId: number, noteId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${subjectId}/notes/${noteId}`).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        AppCache.invalidate('subjects_list');
        this.events.emit('note:deleted');
      })
    );
  }

  addSchedule(subjectId: number, dto: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    classroom?: string;
  }): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.baseUrl}/${subjectId}/schedules`, dto).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        this.events.emit('schedule:created');
      })
    );
  }

  deleteSchedule(subjectId: number, scheduleId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${subjectId}/schedules/${scheduleId}`).pipe(
      tap(() => {
        AppCache.invalidate(`subject_${subjectId}`);
        this.events.emit('schedule:deleted');
      })
    );
  }
}
