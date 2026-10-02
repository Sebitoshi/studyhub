import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideBriefcase, lucideBookmark, lucideMapPin, lucideClock,
  lucideDollarSign, lucideSearch, lucideChevronDown, lucideLoader,
  lucideCheckCircle2, lucideSparkles, lucideX, lucideGlobe,
  lucidePlus, lucidePencil, lucideTrash2, lucideGraduationCap,
  lucideAward, lucideLanguages, lucideFolderGit2, lucideDownload,
  lucideSave, lucideExternalLink, lucideGithub, lucideShare2,
  lucideMail, lucidePhone, lucideLink,
} from '@ng-icons/lucide';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ProfileService } from '../../services/profile.service';
import {
  ResumeService, Resume, ResumeExperience, ResumeEducation,
  ResumeProject, ResumeCertificate, ResumeLanguage,
} from '../../services/resume.service';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-mi-cv',
  standalone: true,
  imports: [SidebarComponent, RouterLink, NgIconComponent, FormsModule, PageHeaderComponent],
  providers: [provideIcons({
    lucideBriefcase, lucideBookmark, lucideMapPin, lucideClock,
    lucideDollarSign, lucideSearch, lucideChevronDown, lucideLoader,
    lucideCheckCircle2, lucideSparkles, lucideX, lucideGlobe,
    lucidePlus, lucidePencil, lucideTrash2, lucideGraduationCap,
    lucideAward, lucideLanguages, lucideFolderGit2, lucideDownload,
    lucideSave, lucideExternalLink, lucideGithub, lucideShare2,
    lucideMail, lucidePhone, lucideLink,
  })],
  templateUrl: './mi-cv.component.html',
  styles: [':host { display: contents; }'],
})
export class MiCvComponent implements OnInit {
  protected auth = inject(AuthService);
  protected resumeService = inject(ResumeService);
  protected profileService = inject(ProfileService);

  activeTab = signal<string>('experience');
  editingIndex = signal<number | null>(null);
  saving = signal(false);
  downloading = signal(false);
  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  form = signal<Partial<Resume>>({
    titulo: '',
    resumen: '',
    experiences: [],
    educations: [],
    projects: [],
    certificates: [],
    languages: [],
  });

  ngOnInit(): void {
    this.resumeService.getMyResume().subscribe({
      next: (r) => {
        if (r) {
          this.form.set({
            titulo: r.titulo || '',
            resumen: r.resumen || '',
            experiences: r.experiences || [],
            educations: r.educations || [],
            projects: r.projects || [],
            certificates: r.certificates || [],
            languages: r.languages || [],
          });
        }
      },
      error: (err) => {
        if (err.status === 404) {
          this.form.set({
            titulo: '',
            resumen: '',
            experiences: [],
            educations: [],
            projects: [],
            certificates: [],
            languages: [],
          });
        }
      },
    });
    this.profileService.getPersonalInfo().subscribe();
    this.profileService.getUserSkills().subscribe();
  }

  selectTab(tab: string): void {
    this.activeTab.set(tab);
    this.editingIndex.set(null);
  }

  toggleEditItem(index: number): void {
    if (this.editingIndex() === index) {
      this.editingIndex.set(null);
      this.save();
    } else {
      this.editingIndex.set(index);
    }
  }

  closeEdit(): void {
    this.editingIndex.set(null);
    this.save();
  }

  /** Guarda el CV y resuelve cuando el backend confirmó (o rechaza en error). */
  save(): Promise<void> {
    this.saving.set(true);
    const raw = this.form();
    const body: Record<string, unknown> = {
      titulo: raw.titulo || '',
      resumen: raw.resumen || '',
    };

    const cleanExperiences = (raw.experiences || []).filter(e => e.company && e.position && e.startDate);
    const cleanEducations = (raw.educations || []).filter(e => e.institution && e.degree && e.startDate);
    const cleanProjects = (raw.projects || []).filter(p => p.title && p.description);
    const cleanCertificates = (raw.certificates || []).filter(c => c.title && c.issuer);
    const cleanLanguages = (raw.languages || []).filter(l => l.name && l.level);

    body['experiences'] = cleanExperiences.map(({ id, ...rest }) => rest);
    body['educations'] = cleanEducations.map(({ id, ...rest }) => rest);
    body['projects'] = cleanProjects.map(({ id, ...rest }) => rest);
    body['certificates'] = cleanCertificates.map(({ id, ...rest }) => rest);
    body['languages'] = cleanLanguages.map(({ id, ...rest }) => rest);

    const existing = this.resumeService.resume();
    const obs = existing
      ? this.resumeService.updateResume(body as unknown as Partial<Resume>)
      : this.resumeService.createResume(body as unknown as Partial<Resume>);
    return new Promise<void>((resolve, reject) => {
      obs.subscribe({
        next: (res) => {
          this.saving.set(false);
          if (res) {
            // Mantener el form sincronizado con los valores devueltos.
            this.form.update(f => ({
              ...f,
              experiences: res.experiences || [],
              educations: res.educations || [],
              projects: res.projects || [],
              certificates: res.certificates || [],
              languages: res.languages || [],
            }));
          }
          resolve();
        },
        error: (err) => {
          console.error('Error al guardar CV', err);
          this.saving.set(false);
          reject(err);
        },
      });
    });
  }

  addExperience(): void {
    this.form.update(f => {
      const list = [...(f.experiences || []), { company: '', position: '', description: '', startDate: '', endDate: '', isCurrent: false }];
      this.editingIndex.set(list.length - 1);
      return { ...f, experiences: list };
    });
  }

  removeExperience(i: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.form.update(f => {
      const list = (f.experiences || []).filter((_, idx) => idx !== i);
      return { ...f, experiences: list };
    });
    this.editingIndex.set(null);
    this.save();
  }

  addEducation(): void {
    this.form.update(f => {
      const list = [...(f.educations || []), { institution: '', degree: '', startDate: '', endDate: '', isCurrent: false }];
      this.editingIndex.set(list.length - 1);
      return { ...f, educations: list };
    });
  }

  removeEducation(i: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.form.update(f => {
      const list = (f.educations || []).filter((_, idx) => idx !== i);
      return { ...f, educations: list };
    });
    this.editingIndex.set(null);
    this.save();
  }

  addProject(): void {
    this.form.update(f => {
      const list = [...(f.projects || []), { title: '', description: '', technologies: [], githubUrl: '', liveUrl: '' }];
      this.editingIndex.set(list.length - 1);
      return { ...f, projects: list };
    });
  }

  removeProject(i: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.form.update(f => {
      const list = (f.projects || []).filter((_, idx) => idx !== i);
      return { ...f, projects: list };
    });
    this.editingIndex.set(null);
    this.save();
  }

  addTechToProject(projIdx: number, tech: string): void {
    if (!tech.trim()) return;
    this.form.update(f => {
      const projects = [...(f.projects || [])];
      const p = { ...projects[projIdx] };
      p.technologies = [...(p.technologies || []), tech.trim()];
      projects[projIdx] = p;
      return { ...f, projects };
    });
  }

  removeTechFromProject(projIdx: number, techIdx: number): void {
    this.form.update(f => {
      const projects = [...(f.projects || [])];
      const p = { ...projects[projIdx] };
      p.technologies = p.technologies.filter((_, i) => i !== techIdx);
      projects[projIdx] = p;
      return { ...f, projects };
    });
  }

  addCertificate(): void {
    this.form.update(f => {
      const list = [...(f.certificates || []), { title: '', issuer: '', issueDate: '', credentialUrl: '' }];
      this.editingIndex.set(list.length - 1);
      return { ...f, certificates: list };
    });
  }

  removeCertificate(i: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.form.update(f => {
      const list = (f.certificates || []).filter((_, idx) => idx !== i);
      return { ...f, certificates: list };
    });
    this.editingIndex.set(null);
    this.save();
  }

  addLanguage(): void {
    this.form.update(f => {
      const list = [...(f.languages || []), { name: '', level: 'BASIC' as const }];
      return { ...f, languages: list };
    });
    this.save();
  }

  removeLanguage(i: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.form.update(f => {
      const list = (f.languages || []).filter((_, idx) => idx !== i);
      return { ...f, languages: list };
    });
    this.save();
  }

  trackIndex(_: number, __: any): number {
    return _;
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), 3000);
  }

  getLevelLabel(level: string): string {
    return { BASIC: 'Básico', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado', NATIVE: 'Nativo' }[level] || level;
  }

  formatDate(d: string | undefined | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: 'short' });
  }

  getInitial(): string {
    const info = this.profileService.personalInfo();
    if (info?.nombre && info?.apellido) {
      return info.nombre[0] + info.apellido[0];
    }
    return 'U';
  }

  async downloadPdf(): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const hasContent = !!(this.form().titulo || this.form().resumen ||
        this.form().experiences?.length || this.form().educations?.length ||
        this.form().projects?.length || this.form().certificates?.length ||
        this.form().languages?.length);
      if (!hasContent) {
        this.showToast('Agrega contenido a tu CV antes de descargar el PDF.', 'error');
        return;
      }

      // 1) Guardar SIEMPRE antes de pedir el PDF para que el backend genere
      //    el documento con la última versión del formulario.
      await this.save();
      const resume = this.resumeService.resume();
      if (!resume) {
        this.showToast('No se pudo guardar tu CV antes de generar el PDF.', 'error');
        return;
      }

      // 2) Resolver el userId de forma robusta (resume, perfil o sesión local).
      let userId = resume.userId;
      if (!userId) {
        const info = this.profileService.personalInfo();
        userId = info?.id;
      }
      if (!userId) {
        const raw = localStorage.getItem('user');
        if (raw) {
          try { userId = JSON.parse(raw)?.id; } catch { /* ignorar */ }
        }
      }
      if (!userId) {
        this.showToast('No se encontró tu usuario para generar el PDF.', 'error');
        return;
      }

      const token = localStorage.getItem('access_token') ?? '';
      const res = await fetch(
        `${'https://study-hub-backend-sigma.vercel.app'}/resume/${userId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        let message = `Error ${res.status}`;
        if (contentType.includes('application/json')) {
          try {
            const err = await res.json();
            message = err?.message || message;
          } catch { /* cuerpo no parseable */ }
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      // El backend debe responder un PDF (algunos servidores usan octet-stream).
      const isPdf = blob.type.includes('pdf') || blob.type.includes('octet-stream');
      if (!isPdf && blob.size === 0) {
        throw new Error('El servidor no devolvió un PDF válido.');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CV-${this.fullName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      this.showToast('PDF generado correctamente', 'success');
    } catch (err) {
      console.error('Error al descargar PDF:', err);
      this.showToast(err instanceof Error && err.message ? err.message : 'No se pudo generar el PDF. Intenta de nuevo.', 'error');
    } finally {
      this.downloading.set(false);
    }
  }

  get fullName(): string {
    const info = this.profileService.personalInfo();
    if (info?.nombre && info?.apellido) return `${info.nombre} ${info.apellido}`;
    return 'Usuario';
  }

  get userEmail(): string {
    return this.profileService.personalInfo()?.email || '';
  }

  get userLocation(): string {
    const info = this.profileService.personalInfo();
    const parts = [info?.ciudad, info?.pais].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  }

  get userLinkedin(): string {
    return this.profileService.personalInfo()?.linkedin || '';
  }

  get userGithub(): string {
    return this.profileService.personalInfo()?.github || '';
  }

  get userPhone(): string {
    return this.profileService.personalInfo()?.telefono || '';
  }

  get userPortfolio(): string {
    return this.profileService.personalInfo()?.portafolio || '';
  }

  get userWebsite(): string {
    return this.profileService.personalInfo()?.paginaPersonal || '';
  }

  saveContactInfo(): void {
    const info = this.profileService.personalInfo();
    if (!info) return;
    const dto = {
      linkedin: info.linkedin || '',
      github: info.github || '',
      telefono: info.telefono || '',
      portafolio: info.portafolio || '',
      paginaPersonal: info.paginaPersonal || '',
    };
    this.profileService.updatePersonalInfo(dto).subscribe({
      next: () => {
        this.showToast('Contacto guardado', 'success');
      },
      error: () => {
        this.showToast('Error al guardar contacto', 'error');
      },
    });
  }

  updateContactField(field: string, value: string): void {
    const current = this.profileService.personalInfo() || {};
    this.profileService.personal.set({ ...current, [field]: value });
  }

  shareProfile(): void {
    const resume = this.resumeService.resume();
    if (resume?.slug) {
      const url = `${'https://study-hub-backend-sigma.vercel.app'}/resume/public/${resume.slug}`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('Link copiado al portapapeles');
      });
    }
  }
}
