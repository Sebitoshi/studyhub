import { Component, OnInit, inject, ChangeDetectorRef, PLATFORM_ID } from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { CalendarService, CalendarEvent, CalendarTask, CalendarResponse } from '../../services/calendar.service';
import { SubjectsService } from '../../services/subjects.service';
import { EventModalComponent } from './event-modal.component';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [SidebarComponent, EventModalComponent, DatePipe, PageHeaderComponent],
  templateUrl: './agenda.component.html',
  styles: [`:host { display: contents; }`],
})
export class AgendaComponent implements OnInit {
  private calendar = inject(CalendarService);
  private subjects = inject(SubjectsService);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);

  view: 'month' | 'week' | 'day' = 'month';
  currentDate = new Date();
  events: CalendarEvent[] = [];
  tasks: CalendarTask[] = [];
  loading = true;
  showModal = false;
  editingEvent: CalendarEvent | null = null;
  googleConnected = false;
  subjectsList: any[] = [];

  weekDayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  hours = Array.from({ length: 24 }, (_, i) => i);

  selectedDayEvents: (CalendarEvent | CalendarTask)[] = [];

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadEvents();
    this.loadSubjects();
    this.checkGoogleStatus();
  }

  get monthLabel(): string {
    return this.currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }

  get dayLabel(): string {
    return this.currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  get calendarDays(): Date[] {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    const dayOfWeek = start.getDay();
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(start.getDate() - offset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }

  get weekStart(): Date {
    const d = new Date(this.currentDate);
    const day = d.getDay();
    const offset = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  get weekDays(): Date[] {
    const start = this.weekStart;
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  isSameDay(d1: Date, d2: Date): boolean {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  }

  isToday(d: Date): boolean {
    return this.isSameDay(d, new Date());
  }

  isCurrentMonth(d: Date): boolean {
    return d.getMonth() === this.currentDate.getMonth();
  }

  eventsForDay(day: Date): (CalendarEvent | CalendarTask)[] {
    return [...this.events, ...this.tasks].filter(e => {
      const start = new Date(e.startAt);
      return this.isSameDay(start, day);
    });
  }

  eventsForHour(day: Date, hour: number): (CalendarEvent | CalendarTask)[] {
    return this.eventsForDay(day).filter(e => {
      const start = new Date(e.startAt);
      return start.getHours() === hour;
    });
  }

  selectDay(day: Date): void {
    this.currentDate = day;
    this.selectedDayEvents = this.eventsForDay(day);
    if (this.view === 'month') {
      this.view = 'day';
    }
  }

  prev(): void {
    const d = new Date(this.currentDate);
    if (this.view === 'month') d.setMonth(d.getMonth() - 1);
    else if (this.view === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    this.currentDate = d;
    this.loadEvents();
  }

  next(): void {
    const d = new Date(this.currentDate);
    if (this.view === 'month') d.setMonth(d.getMonth() + 1);
    else if (this.view === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    this.currentDate = d;
    this.loadEvents();
  }

  today(): void {
    this.currentDate = new Date();
    this.loadEvents();
  }

  setView(v: 'month' | 'week' | 'day'): void {
    this.view = v;
    this.loadEvents();
  }

  openCreateModal(day?: Date): void {
    this.editingEvent = null;
    this.showModal = true;
    if (day) this.currentDate = day;
  }

  openEditModal(event: CalendarEvent | CalendarTask): void {
    if (event.type === 'TASK') return;
    this.editingEvent = event as CalendarEvent;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingEvent = null;
  }

  onEventSaved(): void {
    this.closeModal();
    this.loadEvents();
  }

  deleteEvent(id: number): void {
    this.calendar.deleteEvent(id).subscribe(() => this.loadEvents());
  }

  toggleGoogle(): void {
    if (this.googleConnected) {
      this.calendar.disconnectGoogle().subscribe(() => {
        this.googleConnected = false;
        this.cdr.markForCheck();
      });
    } else {
      this.calendar.getGoogleConnectUrl().subscribe(res => {
        window.open(res.url, '_blank');
      });
    }
  }

  syncGoogle(): void {
    this.calendar.syncFromGoogle().subscribe(() => this.loadEvents());
  }

  eventStyle(event: CalendarEvent | CalendarTask): string {
    return `border-left: 3px solid ${event.color}; background: ${event.color}15;`;
  }

  typeLabel(type: string): string {
    if (type === 'EXAM') return 'Examen';
    if (type === 'TASK') return 'Tarea';
    return 'Evento';
  }

  typeClass(type: string): string {
    if (type === 'EXAM') return 'bg-red-100 text-red-700';
    if (type === 'TASK') return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-700';
  }

  eventHour(event: CalendarEvent | CalendarTask): number {
    return new Date(event.startAt).getHours();
  }

  private loadEvents(): void {
    this.loading = true;
    let start: string, end: string;

    if (this.view === 'month') {
      const y = this.currentDate.getFullYear();
      const m = this.currentDate.getMonth();
      start = new Date(y, m, 1).toISOString();
      end = new Date(y, m + 1, 0).toISOString();
    } else if (this.view === 'week') {
      start = this.weekStart.toISOString();
      const weekEnd = new Date(this.weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59);
      end = weekEnd.toISOString();
    } else {
      const d = new Date(this.currentDate);
      d.setHours(0, 0, 0, 0);
      start = d.toISOString();
      d.setHours(23, 59, 59);
      end = d.toISOString();
    }

    this.calendar.getEvents(start, end).subscribe({
      next: (res) => {
        this.events = res.events;
        this.tasks = res.tasks;
        this.selectedDayEvents = this.eventsForDay(this.currentDate);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadSubjects(): void {
    this.subjects.getSubjects().subscribe({
      next: (res: any) => this.subjectsList = Array.isArray(res) ? res : [],
    });
  }

  private checkGoogleStatus(): void {
    this.calendar.getGoogleStatus().subscribe({
      next: (res) => {
        this.googleConnected = res.connected;
        this.cdr.markForCheck();
      },
    });
  }
}
