import { SidebarComponent } from '../sidebar/sidebar.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen, lucideClock, lucideCheckCircle, lucidePlus, lucideFlame,
  lucideX, lucideLoader,
} from '@ng-icons/lucide';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SubjectsService, SubjectSummary } from '../../services/subjects.service';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-subjects-list',
  standalone: true,
  imports: [SidebarComponent, RouterLink, NgIconComponent, FormsModule, PageHeaderComponent],
  providers: [provideIcons({
    lucideBookOpen, lucideClock, lucideCheckCircle, lucidePlus, lucideFlame,
    lucideX, lucideLoader,
  })],
  templateUrl: './subjects-list.component.html',
  styles: [`:host { display: contents; }`],
})
export class SubjectsListComponent implements OnInit {
  protected auth = inject(AuthService);
  private subjectsService = inject(SubjectsService);

  subjects = signal<SubjectSummary[]>([]);
  loading = signal(true);
  errorMsg = signal('');

  showNewForm = signal(false);
  newNombre = '';
  newCodigo = '';
  newProfesor = '';
  newSalon = '';
  newCreditos: number | null = null;
  newColor = '#3B82F6';
  newDescripcion = '';
  creating = signal(false);

  user: any = null;

  readonly colorOptions = [
    { value: '#3B82F6', label: 'Azul' },
    { value: '#22C55E', label: 'Verde' },
    { value: '#F97316', label: 'Naranja' },
    { value: '#A855F7', label: 'Púrpura' },
    { value: '#EF4444', label: 'Rojo' },
    { value: '#06B6D4', label: 'Cian' },
    { value: '#F43F5E', label: 'Rosa' },
    { value: '#6366F1', label: 'Índigo' },
  ];

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('user');
      this.user = raw ? JSON.parse(raw) : null;
    }
  }

  ngOnInit(): void {
    this.loadSubjects();
  }

  private loadSubjects(): void {
    this.loading.set(true);
    this.errorMsg.set('');
    this.subjectsService.getSubjects().subscribe({
      next: (data) => {
        this.subjects.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err.error?.message || 'Error al cargar materias. ¿El servidor está corriendo?');
        this.loading.set(false);
      },
    });
  }

  createSubject(): void {
    if (!this.newNombre.trim()) return;
    this.creating.set(true);
    this.subjectsService.createSubject({
      nombre: this.newNombre.trim(),
      codigo: this.newCodigo.trim() || undefined,
      profesor: this.newProfesor.trim() || undefined,
      salon: this.newSalon.trim() || undefined,
      creditos: this.newCreditos ?? undefined,
      color: this.newColor,
      descripcion: this.newDescripcion.trim() || undefined,
    }).subscribe({
      next: () => {
        this.loadSubjects();
        this.resetForm();
        this.showNewForm.set(false);
        this.creating.set(false);
      },
      error: () => this.creating.set(false),
    });
  }

  private resetForm(): void {
    this.newNombre = '';
    this.newCodigo = '';
    this.newProfesor = '';
    this.newSalon = '';
    this.newCreditos = null;
    this.newColor = '#3B82F6';
    this.newDescripcion = '';
  }
}
