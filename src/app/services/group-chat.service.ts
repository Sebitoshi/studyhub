import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, interval, switchMap, catchError, type Subscription } from 'rxjs';

export interface GroupMessage {
  id: number;
  groupId: number;
  userId: number;
  content?: string;
  imageUrl?: string;
  createdAt: string;
  user: {
    id: number;
    nombre: string;
    apellido: string;
  };
}

const API = 'https://study-hub-backend-sigma.vercel.app'!;

/**
 * Cadencia del sondeo del chat. Vercel (serverless) no soporta WebSocket, así
 * que en lugar de socket.io se refresca el historial por HTTP mientras la
 * pantalla está abierta.
 */
const CHAT_POLL_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class GroupChatService {
  private http = inject(HttpClient);
  private pollSub?: Subscription;

  messages = signal<GroupMessage[]>([]);
  connected = signal(false);

  /** Mantiene el chat al día con sondeo HTTP (Vercel no soporta WebSocket). */
  connect(groupId: number): void {
    if (this.pollSub || typeof window === 'undefined') return;
    if (!localStorage.getItem('access_token')) return;

    this.connected.set(true);
    this.pollSub = interval(CHAT_POLL_MS)
      .pipe(
        switchMap(() => this.loadHistory(groupId)),
        // Un fallo puntual no debe tumbar el sondeo: se vuelve a intentar en la
        // siguiente pasada.
        catchError(() => []),
      )
      .subscribe();
  }

  disconnect(groupId: number): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
    this.connected.set(false);
    this.messages.set([]);
  }

  loadHistory(groupId: number): Observable<GroupMessage[]> {
    return this.http.get<GroupMessage[]>(`${API}/groups/${groupId}/messages`).pipe(
      tap(msgs => this.messages.set(msgs))
    );
  }

  sendMessage(groupId: number, content: string): void {
    const text = content.trim();
    if (!text) return;

    this.http.post<GroupMessage>(`${API}/groups/${groupId}/messages`, { content: text }).subscribe({
      next: (msg) => this.messages.update(msgs => [...msgs, msg]),
      // Si falla, el sondeo del historial vuelve a traer el estado real del servidor.
      error: () => console.error('No se pudo enviar el mensaje del chat.'),
    });
  }

  sendImage(groupId: number, file: File): Observable<GroupMessage> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<GroupMessage>(`${API}/groups/${groupId}/messages/image`, formData);
  }
}
