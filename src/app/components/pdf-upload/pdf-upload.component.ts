import { Component, input, output, signal } from '@angular/core';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { lucideUpload, lucideFileText, lucideLoaderCircle } from '@ng-icons/lucide';

/**
 * Tamaño máximo aceptado. El backend corre en funciones serverless, cuyo cuerpo de
 * petición está limitado a ~4.5 MB: por encima de eso la subida fallaría sin mensaje útil.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ['.pdf', '.docx', '.txt', '.md'];

/**
 * Zona para arrastrar o elegir un documento (PDF/DOCX/TXT). No procesa nada:
 * avisa al componente padre con el `File` elegido y este lo sube al backend.
 */
@Component({
  selector: 'app-pdf-upload',
  standalone: true,
  imports: [NgIconComponent],
  providers: [provideIcons({ lucideUpload, lucideFileText, lucideLoaderCircle })],
  templateUrl: './pdf-upload.component.html',
})
export class PdfUploadComponent {
  label = input('Sube un PDF');
  hint = input('PDF, DOCX o TXT · se lee el texto del documento');
  busy = input(false);
  busyLabel = input('Leyendo el documento...');
  disabled = input(false);

  fileSelected = output<File>();
  failed = output<string>();

  dragging = signal(false);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.busy() || this.disabled()) return;
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.busy() || this.disabled()) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handle(file);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handle(file);
    // Permite volver a elegir el mismo archivo.
    input.value = '';
  }

  private handle(file: File): void {
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!ACCEPTED.includes(ext) && !file.type.includes('pdf') && !file.type.startsWith('text/')) {
      this.failed.emit('Formato no soportado. Sube un PDF, DOCX o TXT.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.failed.emit('El archivo es muy grande (máximo 4 MB). Comprime el PDF o sube solo el tema que necesitas.');
      return;
    }
    this.fileSelected.emit(file);
  }
}
