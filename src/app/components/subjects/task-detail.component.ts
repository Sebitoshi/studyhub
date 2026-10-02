import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft, lucideCheckCircle, lucideCircle, lucideCalendar,
  lucideLoader, lucidePencil, lucideTrash2, lucideSave,
} from '@ng-icons/lucide';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SubjectsService, Task, TaskHelpers } from '../../services/subjects.service';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [SidebarComponent, RouterLink, DatePipe, FormsModule, NgIconComponent, PageHeaderComponent],
  providers: [provideIcons({
    lucideArrowLeft, lucideCheckCircle, lucideCircle, lucideCalendar,
    lucideLoader, lucidePencil, lucideTrash2, lucideSave,
  })],
  templateUrl: './task-detail.component.html',
  styles: [':host { display: contents; }'],
})
export class TaskDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private subjects = inject(SubjectsService);

  private subjectId = 0;
  private taskId = 0;
  private autoEdit = false;
  private savedTimer?: ReturnType<typeof setTimeout>;

  readonly priorityLabel = TaskHelpers.priorityLabel;
  readonly priorityBg = TaskHelpers.priorityBg;
  readonly priorityColor = TaskHelpers.priorityColor;

  subject = signal<{ id: number; nombre: string; color: string } | null>(null);
  task = signal<Task | null>(null);
  loading = signal(true);
  errorMsg = signal('');
  editing = signal(false);
  saving = signal(false);
  saved = signal(false);

  draftTitle = '';
  draftDescription = '';
  draftPriority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  draftDueDate = '';

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const taskParam = this.route.snapshot.paramMap.get('taskId');
    this.subjectId = Number(idParam);
    this.taskId = Number(taskParam);

    if (isNaN(this.subjectId) || isNaN(this.taskId)) {
      this.router.navigate(['/subjects']);
      return;
    }

    this.autoEdit = this.route.snapshot.queryParamMap.get('edit') === '1';
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.subjects.getSubject(this.subjectId, true).subscribe({
      next: (subj) => {
        const t = (subj.tasks || []).find(x => x.id === this.taskId);
        if (!t) {
          this.errorMsg.set('La tarea no existe o fue eliminada.');
          this.loading.set(false);
          return;
        }
        this.subject.set(subj);
        this.task.set(t);
        this.draftTitle = t.title;
        this.draftDescription = t.description ?? '';
        this.draftPriority = t.priority;
        this.draftDueDate = t.dueDate ? t.dueDate.slice(0, 10) : '';
        this.loading.set(false);
        if (this.autoEdit) this.startEdit();
      },
      error: (err) => {
        this.errorMsg.set(err.error?.message || 'Error al cargar la tarea.');
        this.loading.set(false);
      },
    });
  }

  startEdit(): void {
    this.editing.set(true);
    this.saved.set(false);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  save(): void {
    if (!this.draftTitle.trim() || this.saving()) return;
    this.saving.set(true);
    this.subjects.updateTask(this.subjectId, this.taskId, {
      title: this.draftTitle.trim(),
      description: this.draftDescription.trim() || undefined,
      priority: this.draftPriority,
      dueDate: this.draftDueDate ? new Date(this.draftDueDate).toISOString() : undefined,
    }).subscribe({
      next: (updated) => {
        this.task.set(updated);
        this.draftTitle = updated.title;
        this.draftDescription = updated.description ?? '';
        this.draftPriority = updated.priority;
        this.draftDueDate = updated.dueDate ? updated.dueDate.slice(0, 10) : '';
        this.editing.set(false);
        this.saving.set(false);
        this.showSaved();
      },
      error: () => this.saving.set(false),
    });
  }

  toggleComplete(): void {
    this.subjects.toggleTask(this.subjectId, this.taskId).subscribe({
      next: (updated) => {
        this.task.set(updated);
        this.showSaved();
      },
    });
  }

  deleteTask(): void {
    const t = this.task();
    if (!t) return;
    if (!confirm(`¿Eliminar la tarea "${t.title}"? Esta acción no se puede deshacer.`)) return;
    this.subjects.deleteTask(this.subjectId, this.taskId).subscribe({
      next: () => this.router.navigate(['/subjects', this.subjectId]),
    });
  }

  goBack(): void {
    this.router.navigate(['/subjects', this.subjectId]);
  }

  private showSaved(): void {
    this.saved.set(true);
    clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), 2500);
  }

  ngOnDestroy(): void {
    clearTimeout(this.savedTimer);
  }
}
