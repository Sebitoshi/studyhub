import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { AppCache } from '../utils/cache';

const CACHE_KEY = 'dashboard';

export interface DashboardData {
  user: { nombre: string; apellido: string } | null;
  stats: {
    subjects: number;
    pendingTasks: number;
    completedTasks: number;
    notes: number;
  };
  gamification: {
    level: number;
    xp: number;
    totalXp: number;
    xpForNextLevel: number;
    streak: number;
    achievements: number;
  };
  academicRisk: {
    id: number;
    score: number;
    level: string;
    reasons: Record<string, unknown>;
    createdAt: string;
  } | null;
  upcomingClasses: {
    subjectId: number;
    subject: string;
    profesor: string | null;
    startTime: string;
    endTime: string;
    classroom: string | null;
    color: string | null;
  }[];
  upcomingTasks: {
    id: number;
    title: string;
    dueDate: string;
    priority: string;
    subjectId: number;
    subject: string | null;
    subjectColor: string | null;
  }[];
  recentNotes: {
    id: number;
    title: string;
    content: string;
    isPinned: boolean;
    updatedAt: string;
    subject: string | null;
    subjectColor: string | null;
  }[];
  completionRate: number;
}

export interface LeaderboardEntry {
  userId: number;
  nombre: string;
  apellido: string;
  foto: string | null;
  currentStreak?: number;
  bestStreak?: number;
  totalMinutes?: number;
}

export interface LeaderboardData {
  byStreak: LeaderboardEntry[];
  byHours: LeaderboardEntry[];
  me: {
    rankByStreak: number | null;
    rankByHours: number | null;
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);

  getSummary(forceRefresh = false): Observable<DashboardData> {
    if (!forceRefresh) {
      const cached = AppCache.get<DashboardData>(CACHE_KEY);
      if (cached) return of(cached);
    }
    return this.http.get<DashboardData>(`${'https://study-hub-backend-sigma.vercel.app'}/dashboard/summary`).pipe(
      tap(data => AppCache.set(CACHE_KEY, data))
    );
  }

  invalidateCache(): void {
    AppCache.invalidate(CACHE_KEY);
  }

  getLeaderboard(): Observable<LeaderboardData> {
    return this.http.get<LeaderboardData>(`${'https://study-hub-backend-sigma.vercel.app'}/dashboard/leaderboard`);
  }
}
