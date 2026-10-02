import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Location } from '@angular/common';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './legal.component.html',
  styles: [`:host { display: contents; }`],
})
export class LegalComponent {
  private location = inject(Location);

  lastUpdate = '1 de octubre de 2026';

  goBack(): void {
    this.location.back();
  }
}
