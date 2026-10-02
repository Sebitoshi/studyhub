import { Component, input } from '@angular/core';

/**
 * Barra de encabezado común de todas las pantallas: título y subtítulo pegados a la
 * izquierda y las acciones de la página proyectadas a la derecha.
 *
 * Se usa dentro del contenedor desplazable de cada pantalla con las clases
 * `sticky top-0` y márgenes negativos iguales al padding del contenedor, para que la
 * barra ocupe todo el ancho y quede fija arriba mientras el contenido se mueve.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header
      class="px-4 sm:px-6 lg:px-8 py-4 border-b border-[#e2e8f0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 shadow-sm"
    >
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-lg sm:text-xl font-bold tracking-tight text-[#0f172a] truncate">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="text-xs text-[#64748b] mt-0.5">{{ subtitle() }}</p>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
          <ng-content />
        </div>
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  title = input('');
  subtitle = input('');
}
