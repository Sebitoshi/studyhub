import { Component, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideAlarmClock, lucideCalendar, lucideMap, lucideUsers, lucideBriefcase,
  lucideHandshake, lucideZap, lucideFileText, lucideFlame, lucideTrophy, lucideBell,
  lucideChevronRight,
} from '@ng-icons/lucide';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NotificationsService } from '../../services/notifications.service';

import { PageHeaderComponent } from '../page-header/page-header.component';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, DatePipe, SidebarComponent, NgIconComponent, PageHeaderComponent],
  providers: [provideIcons({
    lucideAlarmClock, lucideCalendar, lucideMap, lucideUsers, lucideBriefcase,
    lucideHandshake, lucideZap, lucideFileText, lucideFlame, lucideTrophy, lucideBell,
    lucideChevronRight,
  })],
  templateUrl: './notifications.html',
  styles: [`:host { display: contents; }`]
})
export class NotificationsComponent implements OnInit, OnDestroy {
  notifService = inject(NotificationsService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.notifService.getAll().subscribe();
      this.notifService.getUnreadCount().subscribe();
      this.notifService.startLive();
    }
  }

  ngOnDestroy(): void {
    this.notifService.stopLive();
  }

  markAll(): void {
    this.notifService.markAllAsRead().subscribe();
  }

  markOne(id: number): void {
    this.notifService.markAsRead(id).subscribe();
  }

  openNotification(n: any): void {
    if (!n?.isRead) this.markOne(n.id);
    const link = this.notifService.getNotificationLink(n);
    if (link) this.router.navigate(link.path);
  }
}
