import { Component, Input, inject, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ProfileService } from '../../services/profile.service';
import { GamificationService } from '../../services/gamification.service';
import { EventBusService } from '../../services/event-bus.service';
import { UiPreferencesService } from '../../services/ui-preferences.service';
import { resolveMediaUrl } from '../../utils/media-url';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './sidebar.component.html',
  styles: [`:host { display: contents; }
    @media (min-width: 768px) and (max-width: 1023px) {
      aside { width: 76px !important; }
      aside > div:first-child { padding-left: 0; padding-right: 0; }
      aside > div:first-child a { justify-content: center; }
      aside > div:first-child span, aside nav a { font-size: 0; }
      aside nav a { justify-content: center; padding-left: 0; padding-right: 0; }
      aside nav a svg { width: 20px; height: 20px; }
      aside nav a span { display: none; }
      aside > div:last-child { padding-left: 0.75rem; padding-right: 0.75rem; }
      aside > div:last-child .flex-1 { display: none; }
    }
    @media (max-width: 767px) {
      aside { position: fixed; z-index: 50; bottom: 0; left: 0; right: 0; width: 100% !important; height: 4.5rem; flex-direction: row; }
      aside > div:first-child, aside > div:last-child { display: none; }
      aside nav { display: flex; align-items: center; gap: 0.25rem; overflow-x: auto; padding: 0.5rem 0.75rem; }
      aside nav a { flex: 0 0 2.75rem; justify-content: center; padding: 0.65rem; font-size: 0; }
      aside nav a svg { width: 20px; height: 20px; }
      aside nav a span { display: none; }
    }
    @media (min-width: 768px) {
    :host-context(html[data-navigation='compact']) aside { width: 76px !important; }
    :host-context(html[data-navigation='compact']) aside > div:first-child { padding-left: 0; padding-right: 0; }
    :host-context(html[data-navigation='compact']) aside > div:first-child a { justify-content: center; }
    :host-context(html[data-navigation='compact']) aside > div:first-child span,
    :host-context(html[data-navigation='compact']) aside nav a { font-size: 0; }
    :host-context(html[data-navigation='compact']) aside nav a { justify-content: center; padding-left: 0; padding-right: 0; }
    :host-context(html[data-navigation='compact']) aside nav a svg { width: 20px; height: 20px; }
    :host-context(html[data-navigation='compact']) aside nav a span,
    :host-context(html[data-navigation='compact']) aside > div:last-child .flex-1 { display: none; }
    :host-context(html[data-navigation='compact']) aside > div:last-child { padding-left: 0.75rem; padding-right: 0.75rem; }
    }
  `],
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() activeRoute: string = '';
  protected auth = inject(AuthService);
  protected profileService = inject(ProfileService);
  protected gamificationService = inject(GamificationService);
  protected uiPreferences = inject(UiPreferencesService);
  private events = inject(EventBusService);
  private platformId = inject(PLATFORM_ID);
  private unsubscribers: (() => void)[] = [];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.profileService.getPersonal().subscribe();
      this.gamificationService.getProgress().subscribe();
    }

    // Escuchar cambios de gamificación
    this.unsubscribers.push(
      this.events.on('gamification:updated', () => {
        this.gamificationService.getProgress(true).subscribe();
      })
    );
    this.unsubscribers.push(
      this.events.on('task:created', () => {
        this.gamificationService.getProgress(true).subscribe();
      })
    );
    this.unsubscribers.push(
      this.events.on('task:toggled', () => {
        this.gamificationService.getProgress(true).subscribe();
      })
    );
    this.unsubscribers.push(
      this.events.on('note:created', () => {
        this.gamificationService.getProgress(true).subscribe();
      })
    );
  }

  ngOnDestroy(): void {
    this.unsubscribers.forEach(unsub => unsub());
  }

  get user() {
    // Return profile data from service if available, else fallback to localStorage
    const p = this.profileService.personal();
    if (p) return p;

    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }

  getInitial(): string {
    const u = this.user;
    const name = u?.nombre || u?.email || 'U';
    return name.charAt(0).toUpperCase();
  }

  get avatarUrl(): string | null {
    return resolveMediaUrl(this.user?.foto);
  }

  get fullName(): string {
    const u = this.user;
    if (!u) return 'Usuario';
    return `${u.nombre || ''} ${u.apellido || ''}`.trim() || 'Usuario';
  }

  get level(): number {
    return this.gamificationService.progress()?.level ?? 0;
  }

  get xp(): number {
    return this.gamificationService.progress()?.totalXp ?? 0;
  }
}
