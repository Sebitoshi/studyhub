import { Injectable } from '@angular/core';

export type AppEventType =
  | 'subject:created' | 'subject:updated' | 'subject:deleted'
  | 'task:created' | 'task:toggled' | 'task:updated' | 'task:deleted'
  | 'note:created' | 'note:updated' | 'note:deleted'
  | 'schedule:created' | 'schedule:deleted'
  | 'event:created' | 'event:updated' | 'event:deleted'
  | 'gamification:updated'
  | 'study:session'
  | 'profile:updated'
  | 'goal:created' | 'goal:updated' | 'goal:deleted'
  | 'conversation:updated'
  | 'resume:updated'
  | 'quiz:completed'
  | 'quiz:deleted';

type Callback = () => void;

@Injectable({ providedIn: 'root' })
export class EventBusService {
  private listeners = new Map<AppEventType, Set<Callback>>();

  on(event: AppEventType, callback: Callback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: AppEventType): void {
    this.listeners.get(event)?.forEach(cb => cb());
  }
}
