import { Component, OnInit, inject, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ProfileService } from '../../services/profile.service';
import { GamificationService } from '../../services/gamification.service';
import { EventBusService } from '../../services/event-bus.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { resolveMediaUrl } from '../../utils/media-url';
import { AppTheme, NavigationMode, UiDensity, UiPreferencesService } from '../../services/ui-preferences.service';

type Tab = 'personal' | 'academico' | 'profesional' | 'ajustes';

import { PageHeaderComponent } from '../page-header/page-header.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarComponent,
    PageHeaderComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './profile.html',
  styles: [`:host { display: contents; }`],
})
export class ProfileComponent implements OnInit {
  profileService = inject(ProfileService);
  gamificationService = inject(GamificationService);
  uiPreferences = inject(UiPreferencesService);
  private imageUpload = inject(ImageUploadService);
  private events = inject(EventBusService);
  private platformId = inject(PLATFORM_ID);
  activeTab: Tab = 'personal';

  // local form models
  personal: any = {};
  academic: any = {};
  professional: any = {};
  user: any = {};
  saved = false;
  errorMsg = '';

  // Foto de perfil (señales: la app usa detección de cambios zoneless)
  avatarUploading = signal(false);
  avatarPercent = signal(0);
  avatarError = signal('');
  confirmRemoveAvatar = signal(false);
  removingAvatar = signal(false);

  readonly modalidades = ['ON_SITE', 'REMOTE', 'HYBRID'];
  readonly nivelesProfesionales = ['STUDENT', 'INTERN', 'JUNIOR', 'MID', 'SENIOR'];
  readonly disponibilidades = ['FULL_TIME', 'PART_TIME', 'FREELANCE', 'NOT_AVAILABLE'];
  readonly modalidadesDeseadas = ['ON_SITE', 'REMOTE', 'HYBRID'];
  readonly themes: { id: AppTheme; name: string; description: string; colors: string[] }[] = [
    { id: 'classic', name: 'Clásico StudyHub', description: 'Turquesa y dorado, el diseño original.', colors: ['#021C22', '#0C5A60', '#F4B960'] },
    { id: 'midnight', name: 'Noche', description: 'Menos brillo para estudiar de noche.', colors: ['#111827', '#334155', '#94A3B8'] },
    { id: 'lavender', name: 'Lavanda', description: 'Un aspecto suave con acentos violeta.', colors: ['#3B245E', '#7C3AED', '#F3E8FF'] },
  ];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem('user');
      if (stored) this.user = JSON.parse(stored);

      this.personal = { ...this.user };

      this.profileService.getPersonal().subscribe(() => {
        setTimeout(() => {
          this.personal = { ...this.user, ...this.profileService.personal() };
        });
      });
      this.profileService.getAcademic().subscribe(() => {
        setTimeout(() => {
          this.academic = { ...this.profileService.academic() };
        });
      });
      this.profileService.getProfessional().subscribe(() => {
        setTimeout(() => {
          this.professional = { ...this.profileService.professional() };
        });
      });
      this.gamificationService.getProgress().subscribe();
    }
  }

  setTab(t: string): void { this.activeTab = t as Tab; }

  // ── Foto de perfil ────────────────────────────────────────

  avatarUrl(): string | null {
    // Leer la señal del servicio mantiene la vista reactiva al subir o quitar la foto.
    const live = this.profileService.personal?.()?.foto;
    return resolveMediaUrl(live ?? this.personal?.foto ?? this.user?.foto);
  }

  hasAvatar(): boolean {
    return !!this.avatarUrl();
  }

  onAvatarPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.avatarUploading()) return;

    this.avatarError.set('');
    this.avatarUploading.set(true);
    this.avatarPercent.set(0);

    this.imageUpload
      .uploadAvatar(file, (progress) => this.avatarPercent.set(progress.percent))
      .subscribe({
        next: (result) => {
          this.avatarUploading.set(false);
          this.applyAvatar(result.foto);
          this.flashSaved();
        },
        error: (error) => {
          this.avatarUploading.set(false);
          this.avatarPercent.set(0);
          this.avatarError.set(
            error?.error?.message ||
              error?.message ||
              'No pudimos subir la foto. Inténtalo de nuevo.',
          );
        },
      });
  }

  askRemoveAvatar(): void {
    if (this.avatarUploading() || this.removingAvatar()) return;
    this.confirmRemoveAvatar.set(true);
  }

  doRemoveAvatar(): void {
    this.confirmRemoveAvatar.set(false);
    this.removingAvatar.set(true);
    this.avatarError.set('');

    this.imageUpload.removeAvatar().subscribe({
      next: () => {
        this.removingAvatar.set(false);
        this.applyAvatar(null);
        this.flashSaved();
      },
      error: (error) => {
        this.removingAvatar.set(false);
        this.avatarError.set(
          error?.error?.message || 'No pudimos quitar la foto. Inténtalo de nuevo.',
        );
      },
    });
  }

  private applyAvatar(foto: string | null): void {
    this.user = { ...this.user, foto };
    this.personal = { ...this.personal, foto };
    this.profileService.setAvatar(foto);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('user', JSON.stringify(this.user));
    }
    this.events.emit('profile:updated');
  }

  setTheme(theme: AppTheme): void { this.uiPreferences.update({ theme }); }
  setDensity(density: UiDensity): void { this.uiPreferences.update({ density }); }
  setNavigation(navigation: NavigationMode): void { this.uiPreferences.update({ navigation }); }
  resetAppearance(): void { this.uiPreferences.reset(); this.flashSaved(); }

  savePersonal(): void {
    this.errorMsg = '';
    const originalUser = { ...this.user };
    const dto: any = {};
    if (this.personal.nombre) dto.nombre = this.personal.nombre;
    if (this.personal.apellido) dto.apellido = this.personal.apellido;
    if (this.personal.ciudad) dto.ciudad = this.personal.ciudad;
    if (this.personal.pais) dto.pais = this.personal.pais;
    if (this.personal.biografia) dto.biografia = this.personal.biografia;
    if (this.personal.github) dto.github = this.personal.github;
    if (this.personal.linkedin) dto.linkedin = this.personal.linkedin;
    if (this.personal.portafolio) dto.portafolio = this.personal.portafolio;

    // Optimistic update: save locally first
    this.user = { ...this.user, ...dto };
    localStorage.setItem('user', JSON.stringify(this.user));

    this.profileService.updatePersonal(dto).subscribe({
      next: () => {
        this.flashSaved();
        this.events.emit('profile:updated');
      },
      error: (err) => {
        // Revert on error
        this.user = originalUser;
        localStorage.setItem('user', JSON.stringify(this.user));
        this.errorMsg = err.error?.message || 'Error al guardar. Intenta de nuevo.';
        setTimeout(() => this.errorMsg = '', 3000);
      }
    });
  }

  saveAcademic(): void {
    this.errorMsg = '';
    const originalAcademic = { ...this.academic };

    // Construir DTO con campos que espera el backend
    const dto: any = {
      universidad: this.academic.universidad || '',
      facultad: this.academic.facultad || '',
      carrera: this.academic.carrera || '',
      semestreActual: this.academic.semestreActual || this.academic.semestre || 1,
      modalidad: this.academic.modalidad || 'ON_SITE',
      fechaInicio: this.academic.fechaInicio || new Date().toISOString().split('T')[0],
      fechaGraduacion: this.academic.fechaGraduacion || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
    if (this.academic.promedio != null) {
      dto.promedio = this.academic.promedio;
    }

    // Optimistic update
    this.user = { ...this.user, ...dto };
    localStorage.setItem('user', JSON.stringify(this.user));

    if (this.academic.id) {
      this.profileService.updateAcademic(dto).subscribe({
        next: () => {
          this.flashSaved();
          this.events.emit('profile:updated');
        },
        error: (err) => {
          this.academic = originalAcademic;
          this.errorMsg = err.error?.message || 'Error al guardar. Intenta de nuevo.';
          setTimeout(() => this.errorMsg = '', 3000);
        }
      });
    } else {
      this.profileService.createAcademic(dto).subscribe({
        next: () => {
          this.flashSaved();
          this.events.emit('profile:updated');
        },
        error: (err) => {
          this.academic = originalAcademic;
          this.errorMsg = err.error?.message || 'Error al guardar. Intenta de nuevo.';
          setTimeout(() => this.errorMsg = '', 3000);
        }
      });
    }
  }

  saveProfessional(): void {
    this.errorMsg = '';
    const originalProfessional = { ...this.professional };

    // Optimistic update
    this.user = { ...this.user, ...this.professional };
    localStorage.setItem('user', JSON.stringify(this.user));

    if (this.professional.id) {
      this.profileService.updateProfessional(this.professional).subscribe({
        next: () => {
          this.flashSaved();
          this.events.emit('profile:updated');
        },
        error: (err) => {
          this.professional = originalProfessional;
          this.errorMsg = err.error?.message || 'Error al guardar. Intenta de nuevo.';
          setTimeout(() => this.errorMsg = '', 3000);
        }
      });
    } else {
      this.profileService.createProfessional(this.professional).subscribe({
        next: () => {
          this.flashSaved();
          this.events.emit('profile:updated');
        },
        error: (err) => {
          this.professional = originalProfessional;
          this.errorMsg = err.error?.message || 'Error al guardar. Intenta de nuevo.';
          setTimeout(() => this.errorMsg = '', 3000);
        }
      });
    }
  }

  private flashSaved(): void {
    this.saved = true;
    setTimeout(() => this.saved = false, 2500);
  }

  getInitial(): string {
    return (this.user?.nombre?.charAt(0) ?? 'U').toUpperCase();
  }

  getLevel(): number { return this.gamificationService.progress()?.level ?? 0; }
  getXP(): number { return this.gamificationService.progress()?.totalXp ?? 0; }
  getStreak(): number { return this.gamificationService.progress()?.streak ?? 0; }
  getXPProgress(): number {
    const xp = this.gamificationService.progress()?.xp ?? 0;
    const xpForNext = this.gamificationService.progress()?.xpForNextLevel ?? 500;
    return xpForNext > 0 ? (xp / xpForNext) * 100 : 0;
  }
}
