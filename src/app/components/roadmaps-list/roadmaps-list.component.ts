import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideSparkles,
  lucideFileText,
  lucideLoader,
  lucideRocket,
  lucideTrash2,
  lucideLayers,
  lucideWand2,
} from '@ng-icons/lucide';
import { RoadmapService, RoadmapStep } from '../../services/roadmap.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-roadmaps-list',
  standalone: true,
  imports: [NgIconComponent, RouterLink, FormsModule, ConfirmDialogComponent, PageHeaderComponent],
  providers: [
    provideIcons({
      lucideSparkles,
      lucideFileText,
      lucideLoader,
      lucideRocket,
      lucideTrash2,
      lucideLayers,
      lucideWand2,
    }),
  ],
  templateUrl: './roadmaps-list.component.html',
  styles: [`:host { display: contents; }`],
})
export class RoadmapsListComponent implements OnInit {
  protected roadmapService = inject(RoadmapService);
  protected showDeleteDialog = signal(false);
  protected deleteTargetId = signal<number | null>(null);

  protected topic = signal('');
  protected goal = signal('');
  protected topicError = signal('');

  protected readonly suggestions = [
    'Inglés',
    'Cálculo',
    'Programación',
    'Matemáticas',
    'Física',
    'Diseño UI',
  ];

  ngOnInit(): void {
    this.roadmapService.findAll().subscribe();
  }

  pickSuggestion(s: string): void {
    this.topic.set(s);
    this.topicError.set('');
  }

  generateRoadmap(): void {
    const topic = this.topic().trim();
    if (!topic) {
      this.topicError.set('Escribe qué quieres aprender (ej: Inglés, Cálculo).');
      return;
    }
    this.topicError.set('');
    this.roadmapService
      .generate({ topic, goal: this.goal().trim() || undefined })
      .subscribe();
    this.goal.set('');
  }

  completedCount(steps: RoadmapStep[] | undefined): number {
    return steps ? steps.filter((s) => s.completed).length : 0;
  }

  progressPercent(steps: RoadmapStep[] | undefined): number {
    if (!steps || !steps.length) return 0;
    return Math.round((this.completedCount(steps) / steps.length) * 100);
  }

  confirmDelete(event: Event, id: number): void {
    event.stopPropagation();
    event.preventDefault();
    this.deleteTargetId.set(id);
    this.showDeleteDialog.set(true);
  }

  onDeleteConfirmed(): void {
    const id = this.deleteTargetId();
    if (id !== null) {
      this.roadmapService.deleteRoadmap(id).subscribe();
    }
    this.showDeleteDialog.set(false);
    this.deleteTargetId.set(null);
  }

  onDeleteCancelled(): void {
    this.showDeleteDialog.set(false);
    this.deleteTargetId.set(null);
  }
}
