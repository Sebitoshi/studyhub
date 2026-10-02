import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideBriefcase, lucideBookmark, lucideBookmarkCheck,
  lucideMapPin, lucideClock, lucideDollarSign, lucideSearch,
  lucideChevronDown, lucideLoader, lucideCheckCircle2,
  lucideSparkles, lucideX, lucideGlobe,
} from '@ng-icons/lucide';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { JobsService, Job, SavedJob, JobApplication, JobMatch } from '../../services/jobs.service';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [SidebarComponent, RouterLink, NgIconComponent, FormsModule, PageHeaderComponent],
  providers: [provideIcons({
    lucideBriefcase, lucideBookmark, lucideBookmarkCheck,
    lucideMapPin, lucideClock, lucideDollarSign, lucideSearch,
    lucideChevronDown, lucideLoader, lucideCheckCircle2,
    lucideSparkles, lucideX, lucideGlobe,
  })],
  templateUrl: './jobs.component.html',
  styles: [':host { display: contents; }'],
})
export class JobsComponent implements OnInit {
  protected auth = inject(AuthService);
  private jobsService = inject(JobsService);

  // Tab
  activeTab = signal<'todos' | 'guardados' | 'postulaciones'>('todos');

  // Data
  allJobs = signal<Job[]>([]);
  savedJobsList = signal<SavedJob[]>([]);
  applicationsList = signal<JobApplication[]>([]);
  savedJobIds = signal<Set<number>>(new Set());
  appliedJobIds = signal<Set<number>>(new Set());

  // UI state
  loading = signal(true);
  errorMsg = signal('');
  discovering = signal(false);
  discoverMsg = signal('');

  // Search & Filters
  searchQuery = signal('');
  selectedLevel = signal<string>('');
  selectedModality = signal<string>('');
  selectedCountry = signal<string>('');
  selectedCity = signal<string>('');
  studentFriendly = signal(false);
  showLevelDropdown = signal(false);
  showModalityDropdown = signal(false);
  showCountryDropdown = signal(false);
  showCityDropdown = signal(false);

  // Pagination
  total = signal(0);
  page = signal(1);
  limit = 20;

  // Modal
  selectedJob = signal<Job | null>(null);
  jobMatch = signal<JobMatch | null>(null);
  matchLoading = signal(false);

  // Apply confirmation
  pendingApplyJob = signal<Job | null>(null);

  // Status menu
  showApplicationMenu = signal<number | null>(null);

  levels = ['STUDENT', 'INTERN', 'JUNIOR', 'MID', 'SENIOR'];
  modalities = ['ON_SITE', 'REMOTE', 'HYBRID'];
  statusOptions = ['SAVED', 'APPLIED', 'INTERVIEW', 'REJECTED', 'HIRED'];

  visibleJobs = computed(() => {
    const tab = this.activeTab();
    if (tab === 'guardados') return this.savedJobsList().map(s => s.job);
    if (tab === 'postulaciones') return this.applicationsList().map(a => a.job);
    return this.allJobs();
  });

  visibleCount = computed(() => {
    if (this.activeTab() === 'guardados') return this.savedJobsList().length;
    if (this.activeTab() === 'postulaciones') return this.applicationsList().length;
    return this.total();
  });

  ngOnInit(): void {
    this.loadAll();
    this.loadSaved();
    this.loadApplications();
  }

  switchTab(tab: 'todos' | 'guardados' | 'postulaciones') {
    this.activeTab.set(tab);
  }

  private loadAll(): void {
    this.loading.set(true);
    this.jobsService.getJobs({
      page: this.page(),
      limit: this.limit,
      seniority: this.selectedLevel() || undefined,
      modality: this.selectedModality() || undefined,
      studentFriendly: this.studentFriendly() || undefined,
      country: this.selectedCountry() || undefined,
      city: this.selectedCity() || undefined,
      search: this.searchQuery() || undefined,
    }).subscribe({
      next: (res) => {
        this.allJobs.set(res.jobs);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Error al cargar empleos');
        this.loading.set(false);
      },
    });
  }

  private loadSaved(): void {
    this.jobsService.getSavedJobs().subscribe({
      next: (res) => {
        this.savedJobsList.set(res);
        this.savedJobIds.set(new Set(res.map(s => s.jobId)));
      },
    });
  }

  private loadApplications(): void {
    this.jobsService.getApplications().subscribe({
      next: (res) => {
        this.applicationsList.set(res);
        this.appliedJobIds.set(new Set(res.map(a => a.jobId)));
      },
    });
  }

  isSaved(jobId: number): boolean {
    return this.savedJobIds().has(jobId);
  }

  isApplied(jobId: number): boolean {
    return this.appliedJobIds().has(jobId);
  }

  getApplication(jobId: number): JobApplication | undefined {
    return this.applicationsList().find(a => a.jobId === jobId);
  }

  getApplicationStatus(jobId: number): string | null {
    return this.getApplication(jobId)?.status || null;
  }

  // --- Save / Unsave ---

  toggleSave(jobId: number, event: Event): void {
    event.stopPropagation();
    if (this.isSaved(jobId)) {
      this.jobsService.unsaveJob(jobId).subscribe({
        next: () => {
          this.savedJobIds.update(s => { s.delete(jobId); return new Set(s); });
          this.loadSaved();
        },
      });
    } else {
      this.jobsService.saveJob(jobId).subscribe({
        next: () => {
          this.savedJobIds.update(s => { s.add(jobId); return new Set(s); });
          this.loadSaved();
        },
      });
    }
  }

  // --- Apply ---

  applyToJob(job: Job, event: Event): void {
    event.stopPropagation();
    if (job.sourceUrl) {
      window.open(job.sourceUrl, '_blank');
    }
    this.pendingApplyJob.set(job);
  }

  confirmApply(jobId: number, didApply: boolean): void {
    this.pendingApplyJob.set(null);
    if (!didApply) return;
    this.jobsService.applyToJob(jobId).subscribe({
      next: () => {
        this.appliedJobIds.update(s => { s.add(jobId); return new Set(s); });
        this.loadApplications();
      },
    });
  }

  // --- Status update ---

  updateStatus(jobId: number, status: string, event: Event): void {
    event.stopPropagation();
    this.jobsService.updateApplicationStatus(jobId, status).subscribe({
      next: () => {
        this.loadApplications();
        this.showApplicationMenu.set(null);
      },
    });
  }

  withdraw(jobId: number, event: Event): void {
    event.stopPropagation();
    this.jobsService.withdrawApplication(jobId).subscribe({
      next: () => {
        this.appliedJobIds.update(s => { s.delete(jobId); return new Set(s); });
        this.loadApplications();
        this.showApplicationMenu.set(null);
      },
    });
  }

  // --- Modal ---

  openModal(job: Job): void {
    this.selectedJob.set(job);
    this.jobMatch.set(null);
    this.matchLoading.set(true);

    this.jobsService.getJobMatch(job.id).subscribe({
      next: (match) => {
        this.jobMatch.set(match);
        this.matchLoading.set(false);
      },
      error: () => {
        this.matchLoading.set(false);
      },
    });
  }

  closeModal(): void {
    this.selectedJob.set(null);
    this.jobMatch.set(null);
  }

  applyFromModal(): void {
    const job = this.selectedJob();
    if (!job) return;
    if (job.sourceUrl) {
      window.open(job.sourceUrl, '_blank');
    }
    this.pendingApplyJob.set(job);
    this.closeModal();
  }

  // --- Pagination ---

  prevPage(): void {
    if (this.page() > 1) {
      this.page.update(p => p - 1);
      this.loadAll();
    }
  }

  nextPage(): void {
    if (this.page() * this.limit < this.total()) {
      this.page.update(p => p + 1);
      this.loadAll();
    }
  }

  totalPages = computed(() => Math.ceil(this.total() / this.limit));

  // --- Search ---

  search(): void {
    this.page.set(1);
    this.loadAll();
  }

  selectLevel(level: string): void {
    this.selectedLevel.set(this.selectedLevel() === level ? '' : level);
    this.showLevelDropdown.set(false);
  }

  selectModality(modality: string): void {
    this.selectedModality.set(this.selectedModality() === modality ? '' : modality);
    this.showModalityDropdown.set(false);
  }

  toggleStudentFriendly(): void {
    this.studentFriendly.set(!this.studentFriendly());
    this.search();
  }

  selectCountry(country: string): void {
    this.selectedCountry.set(this.selectedCountry() === country ? '' : country);
    this.showCountryDropdown.set(false);
  }

  selectCity(city: string): void {
    this.selectedCity.set(this.selectedCity() === city ? '' : city);
    this.showCityDropdown.set(false);
  }

  discoverFromProfile(): void {
    this.discovering.set(true);
    this.discoverMsg.set('');
    this.jobsService.discoverJobs().subscribe({
      next: (res) => {
        this.discovering.set(false);
        if (res.found === 0) {
          this.discoverMsg.set('No se encontraron empleos nuevos. Agrega skills y cargo en tu perfil.');
        } else {
          this.discoverMsg.set(`Se encontraron ${res.found} empleos, ${res.saved} nuevos guardados.`);
          this.loadAll();
        }
      },
      error: () => {
        this.discovering.set(false);
        this.discoverMsg.set('Error al buscar empleos. Intenta de nuevo.');
      },
    });
  }

  // --- Dropdowns ---

  toggleApplicationMenu(jobId: number, event: Event): void {
    event.stopPropagation();
    this.showApplicationMenu.set(this.showApplicationMenu() === jobId ? null : jobId);
  }

  // --- Utilities ---

  getInitials(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  getSalaryLabel(job: Job): string {
    if (job.salaryMin && job.salaryMax) return `$${this.fmt(job.salaryMin)} - $${this.fmt(job.salaryMax)}`;
    if (job.salaryMin) return `Desde $${this.fmt(job.salaryMin)}`;
    if (job.salaryMax) return `Hasta $${this.fmt(job.salaryMax)}`;
    return 'Salario no especificado';
  }

  private fmt(n: number): string {
    return n.toLocaleString('es-CO');
  }

  getSeniorityLabel(s: string | null): string {
    const m: Record<string, string> = {
      STUDENT: 'ESTUDIANTE', INTERN: 'INTERN', JUNIOR: 'JUNIOR',
      MID: 'MID', SENIOR: 'SENIOR',
    };
    return s ? m[s] || s : '';
  }

  getModalityLabel(m: string | null): string {
    if (!m) return '';
    const map: Record<string, string> = { ON_SITE: 'Presencial', REMOTE: 'Remoto', HYBRID: 'Híbrido' };
    return map[m] || m;
  }

  getStatusLabel(s: string): string {
    const m: Record<string, string> = {
      SAVED: 'Guardado', APPLIED: 'Postulado', INTERVIEW: 'Entrevista',
      REJECTED: 'Rechazado', HIRED: 'Contratado',
    };
    return m[s] || s;
  }

  getStatusColor(s: string): string {
    const m: Record<string, string> = {
      SAVED: '#6b7280', APPLIED: '#2563eb', INTERVIEW: '#7c3aed',
      REJECTED: '#dc2626', HIRED: '#059669',
    };
    return m[s] || '#6b7280';
  }

  getPublishedDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getSeniorityColor(s: string | null): string {
    if (!s) return '#6b7280';
    if (s === 'STUDENT' || s === 'INTERN') return '#0f766e';
    if (s === 'JUNIOR') return '#2563eb';
    if (s === 'MID') return '#7c3aed';
    if (s === 'SENIOR') return '#dc2626';
    return '#6b7280';
  }
}
