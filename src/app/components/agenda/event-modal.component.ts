import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarService, CalendarEvent, CreateEventPayload } from '../../services/calendar.service';

@Component({
  selector: 'app-event-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './event-modal.component.html',
})
export class EventModalComponent implements OnInit {
  @Input() event: CalendarEvent | null = null;
  @Input() subjects: any[] = [];
  @Input() selectedDate: Date = new Date();
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private calendar = inject(CalendarService);
  private cdr = inject(ChangeDetectorRef);

  title = '';
  description = '';
  startDate = '';
  startTime = '08:00';
  endDate = '';
  endTime = '09:00';
  allDay = false;
  color = '#3b82f6';
  type: 'EVENT' | 'EXAM' = 'EVENT';
  subjectId: number | null = null;
  saving = false;
  errorMessage = '';

  colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#0f766e'];

  ngOnInit(): void {
    if (this.event) {
      this.title = this.event.title;
      this.description = this.event.description || '';
      this.startDate = this.formatDate(new Date(this.event.startAt));
      this.startTime = this.formatTime(new Date(this.event.startAt));
      this.endDate = this.formatDate(new Date(this.event.endAt));
      this.endTime = this.formatTime(new Date(this.event.endAt));
      this.allDay = this.event.allDay;
      this.color = this.event.color;
      this.type = this.event.type;
      this.subjectId = this.event.subjectId || null;
    } else {
      this.startDate = this.formatDate(this.selectedDate);
      this.endDate = this.formatDate(this.selectedDate);
    }
  }

  onSave(): void {
    if (!this.title.trim() || !this.startDate || !this.endDate) return;

    const start = this.allDay ? new Date(`${this.startDate}T00:00:00`) : new Date(`${this.startDate}T${this.startTime}:00`);
    const end = this.allDay ? new Date(`${this.endDate}T23:59:59`) : new Date(`${this.endDate}T${this.endTime}:00`);
    if (end <= start) {
      this.errorMessage = 'La fecha y hora de finalización debe ser posterior al inicio.';
      return;
    }
    this.errorMessage = '';

    this.saving = true;

    const payload: CreateEventPayload = {
      title: this.title.trim(),
      description: this.description.trim() || undefined,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      allDay: this.allDay,
      color: this.color,
      type: this.type,
      subjectId: this.subjectId || undefined,
    };

    const obs = this.event
      ? this.calendar.updateEvent(this.event.id, payload)
      : this.calendar.createEvent(payload);

    obs.subscribe({
      next: () => {
        this.saving = false;
        this.saved.emit();
      },
      error: () => {
        this.saving = false;
        this.errorMessage = 'No se pudo guardar. Revisa los datos e inténtalo otra vez.';
        this.cdr.markForCheck();
      },
    });
  }

  onDelete(): void {
    if (!this.event) return;
    this.calendar.deleteEvent(this.event.id).subscribe(() => this.saved.emit());
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(d: Date): string {
    return d.toTimeString().slice(0, 5);
  }
}
