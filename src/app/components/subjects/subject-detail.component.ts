import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft, lucideTrash2, lucideCheckCircle, lucideClock,
  lucideBookOpen, lucidePlus, lucideListTodo, lucideFileText,
  lucideCalendar, lucidePin, lucideLoader,
} from '@ng-icons/lucide';
import { AuthService } from '../../services/auth.service';
import { SubjectsService, SubjectDetail } from '../../services/subjects.service';
import { SubjectTasksComponent } from './subject-tasks.component';
import { SubjectNotesComponent } from './subject-notes.component';
import { SubjectSchedulesComponent } from './subject-schedules.component';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-subject-detail',
  standalone: true,
  imports: [SidebarComponent, RouterLink, NgIconComponent, SubjectTasksComponent, SubjectNotesComponent, SubjectSchedulesComponent, PageHeaderComponent],
  providers: [provideIcons({
    lucideArrowLeft, lucideTrash2, lucideCheckCircle, lucideClock,
    lucideBookOpen, lucidePlus, lucideListTodo, lucideFileText,
    lucideCalendar, lucidePin, lucideLoader,
  })],
  templateUrl: './subject-detail.component.html',
  styles: [`:host { display: contents; }`],
})
export class SubjectDetailComponent implements OnInit {
  protected auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private subjectsService = inject(SubjectsService);

  subject = signal<SubjectDetail | null>(null);
  loading = signal(true);
  errorMsg = signal('');
  activeTab = signal<'tareas' | 'notas' | 'horarios'>('tareas');

  user: any = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('user');
      this.user = raw ? JSON.parse(raw) : null;
    }
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) {
      this.router.navigate(['/subjects']);
      return;
    }
    const id = Number(idParam);
    if (isNaN(id)) {
      this.router.navigate(['/subjects']);
      return;
    }
    this.subjectsService.getSubject(id).subscribe({
      next: (data) => {
        this.subject.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err.error?.message || 'Error al cargar la materia');
        this.loading.set(false);
      },
    });
  }

  switchTab(tab: 'tareas' | 'notas' | 'horarios') {
    this.activeTab.set(tab);
  }

  deleteSubject(): void {
    const subj = this.subject();
    if (!subj) return;
    if (!confirm(`¿Eliminar "${subj.nombre}"? Esta acción no se puede deshacer.`)) return;
    this.subjectsService.deleteSubject(subj.id).subscribe({
      next: () => this.router.navigate(['/subjects']),
    });
  }
}
