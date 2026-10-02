import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideUsers, lucideCalendar, lucideSparkles, lucideArrowRight, lucideX } from '@ng-icons/lucide';
import { StudyGroupService } from '../../services/study-group.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { RouterLink } from '@angular/router';

type Tab = 'todos' | 'mis-grupos' | 'recomendados';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-study-groups',
  standalone: true,
  imports: [CommonModule, NgIconComponent, SidebarComponent, FormsModule, RouterLink, PageHeaderComponent],
  providers: [provideIcons({ lucidePlus, lucideUsers, lucideCalendar, lucideSparkles, lucideArrowRight, lucideX })],
  templateUrl: './study-groups.html',
  styles: [`:host { display: contents; }`],
})
export class StudyGroups implements OnInit {
  protected groupService = inject(StudyGroupService);
  
  private platformId = inject(PLATFORM_ID);
  activeTab = signal<Tab>('todos');

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadData();
    }
  }

  loadData(): void {
    this.groupService.getAllGroups().subscribe();
    this.groupService.getMyGroups().subscribe();
    this.groupService.getRecommendedGroups().subscribe();
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  getInitials(nombre: string, apellido: string): string {
    return `${nombre?.charAt(0) || ''}${apellido?.charAt(0) || ''}`.toUpperCase();
  }

  joinGroup(id: number, isPublic: boolean): void {
    if (!isPublic) {
      this.pinTarget = id;
      this.pinValue = '';
      this.pinError = '';
      this.showPinModal = true;
    } else {
      this.groupService.joinGroup(id).subscribe({
        error: () => {}
      });
    }
  }

  showPinModal = false;
  pinTarget: number | null = null;
  pinValue = '';
  pinError = '';

  confirmJoinWithPin(): void {
    if (this.pinValue.length !== 4) {
      this.pinError = 'El PIN debe tener 4 dígitos';
      return;
    }
    this.groupService.joinGroup(this.pinTarget!, this.pinValue).subscribe({
      next: () => {
        this.showPinModal = false;
        this.pinTarget = null;
        this.pinValue = '';
        this.pinError = '';
      },
      error: (err) => {
        this.pinError = err?.error?.message || 'PIN incorrecto';
      }
    });
  }

  get recommendedContextText(): string {
    const groups = this.groupService.recommendedGroups();
    if (!groups.length) return '';
    const reasons = new Set<string>();
    groups.forEach(g => {
      if (g.reasons) g.reasons.forEach(r => reasons.add(r));
    });
    const uniqueReasons = Array.from(reasons);
    if (uniqueReasons.length > 0) {
      return `Basados en tus brechas de conocimiento y metas: ${uniqueReasons.slice(0, 2).join(', ')}.`;
    }
    return 'Recomendaciones IA basadas en tus brechas de conocimiento y materias.';
  }

  showCreateModal = false;
  subjects: any[] = [];
  newGroup = {
    name: '',
    description: '',
    subjectId: null as number | null,
    subjectName: '',
    maxMembers: 20,
    isPublic: true,
    password: ''
  };

  openCreateModal(): void {
    this.showCreateModal = true;
    this.groupService.getSubjects().subscribe(subs => {
      this.subjects = subs;
    });
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
    this.newGroup = { name: '', description: '', subjectId: null, subjectName: '', maxMembers: 20, isPublic: true, password: '' };
  }

  createGroup(): void {
    this.groupService.createGroup(this.newGroup).subscribe(() => {
      this.closeCreateModal();
    });
  }

  isMember(groupId: number): boolean {
    return this.groupService.myGroups().some(g => g.id === groupId);
  }
}
