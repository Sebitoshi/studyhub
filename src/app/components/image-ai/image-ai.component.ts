import {
  Component,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideBookOpen,
  lucideBrain,
  lucideCheckCircle2,
  lucideChevronRight,
  lucideImage,
  lucideLightbulb,
  lucideListChecks,
  lucideLoaderCircle,
  lucideRotateCcw,
  lucideScanEye,
  lucideSparkles,
  lucideTarget,
  lucideUpload,
  lucideWandSparkles,
  lucideX,
} from '@ng-icons/lucide';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { PageHeaderComponent } from '../page-header/page-header.component';
import {
  AiService,
  ImageContentPhase,
  ImageDetailPhase,
  ImagePhaseMeta,
  InternalPromptPhase,
} from '../../services/ai.service';
import { apiErrorMessage } from '../../utils/api-error';

/** Estado visual de cada fase del pipeline. */
type StepState = 'idle' | 'running' | 'done' | 'error';

/** Objetivo de peso: por debajo del límite del borde de Vercel (~1 MB). */
const TARGET_BYTES = 900 * 1024;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

@Component({
  selector: 'app-image-ai',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarComponent,
    PageHeaderComponent,
    NgIconComponent,
  ],
  providers: [
    provideIcons({
      lucideAlertCircle,
      lucideBookOpen,
      lucideBrain,
      lucideCheckCircle2,
      lucideChevronRight,
      lucideImage,
      lucideLightbulb,
      lucideListChecks,
      lucideLoaderCircle,
      lucideRotateCcw,
      lucideScanEye,
      lucideSparkles,
      lucideTarget,
      lucideUpload,
      lucideWandSparkles,
      lucideX,
    }),
  ],
  templateUrl: './image-ai.component.html',
})
export class ImageAiComponent implements OnDestroy {
  private ai = inject(AiService);
  private platformId = inject(PLATFORM_ID);

  readonly enfoques = ['estudio general', 'examen', 'resumen', 'resolver ejercicios'];

  /** Imagen ya comprimida y lista para enviar. */
  file = signal<File | null>(null);
  previewUrl = signal<string | null>(null);
  originalBytes = signal(0);
  dragging = signal(false);
  compressing = signal(false);
  enfoque = signal(this.enfoques[0]);

  // Estado de las tres fases.
  phase1 = signal<StepState>('idle');
  phase2 = signal<StepState>('idle');
  phase3 = signal<StepState>('idle');

  content = signal<ImageContentPhase | null>(null);
  prompt = signal<InternalPromptPhase | null>(null);
  detail = signal<ImageDetailPhase | null>(null);

  meta1 = signal<ImagePhaseMeta | null>(null);
  meta2 = signal<ImagePhaseMeta | null>(null);
  meta3 = signal<ImagePhaseMeta | null>(null);

  error = signal<string | null>(null);

  running = computed(
    () =>
      this.phase1() === 'running' ||
      this.phase2() === 'running' ||
      this.phase3() === 'running',
  );

  hasResults = computed(
    () => this.phase1() !== 'idle' || this.phase2() !== 'idle' || this.phase3() !== 'idle',
  );

  canAnalyze = computed(() => !!this.file() && !this.running() && !this.compressing());

  ngOnDestroy(): void {
    this.revokePreview();
  }

  // ---------------------------------------------------------------------------
  // Selección y compresión de la imagen
  // ---------------------------------------------------------------------------

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.handleFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.running()) return;
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.running()) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.handleFile(file);
  }

  async handleFile(file: File): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!file.type.startsWith('image/')) {
      this.error.set('Selecciona una imagen (JPG, PNG o WebP).');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.error.set('La imagen supera los 25 MB. Prueba con una más ligera.');
      return;
    }

    this.clearResults();
    this.error.set(null);
    this.originalBytes.set(file.size);
    this.compressing.set(true);

    try {
      const compressed = await this.compressImage(file);
      this.setPreview(compressed);
      this.file.set(compressed);
    } catch {
      this.error.set('No pudimos preparar la imagen. Prueba con otra.');
    } finally {
      this.compressing.set(false);
    }
  }

  removeFile(): void {
    if (this.running()) return;
    this.revokePreview();
    this.file.set(null);
    this.originalBytes.set(0);
    this.clearResults();
    this.error.set(null);
  }

  /**
   * Reduce la imagen en el navegador: mantiene la proporción, limita el lado mayor
   * y baja la calidad de WebP hasta quedar por debajo del objetivo. Así la petición
   * no choca con el límite del borde de Vercel (multipart binario > ~1 MB → 503).
   *
   * Se prueban varios tamaños: si con 1600 px la imagen sigue pesando demasiado
   * (fotos muy ruidosas), se reintenta con 1280 y 1024 px.
   */
  private async compressImage(file: File): Promise<File> {
    let bitmap: ImageBitmap | HTMLImageElement | null = null;
    let objectUrl: string | null = null;

    try {
      if (typeof createImageBitmap === 'function') {
        try {
          // Respeta la orientación EXIF de las fotos de móvil.
          bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
          bitmap = null;
        }
      }

      if (!bitmap) {
        objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        await img.decode();
        bitmap = img;
      }

      const width = bitmap.width;
      const height = bitmap.height;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas no disponible');

      let blob: Blob | null = null;

      for (const maxSide of [1600, 1280, 1024]) {
        const scale = Math.min(1, maxSide / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));

        // Fondo blanco: evita que las transparencias queden negras al pasar a WebP.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
          blob = await this.toBlob(canvas, 'image/webp', quality);
          if (blob && blob.size <= TARGET_BYTES) break;
        }

        if (blob && blob.size <= TARGET_BYTES) break;
      }

      if (!blob) {
        blob = await this.toBlob(canvas, 'image/jpeg', 0.8);
      }
      if (!blob) throw new Error('No se pudo comprimir');

      const name = file.name.replace(/\.[^.]+$/, '') || 'imagen';
      return new File([blob], `${name}.webp`, { type: blob.type || 'image/webp' });
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (bitmap && 'close' in bitmap) (bitmap as ImageBitmap).close();
    }
  }

  private toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
  }

  private setPreview(file: File): void {
    this.revokePreview();
    this.previewUrl.set(URL.createObjectURL(file));
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }

  // ---------------------------------------------------------------------------
  // Pipeline de tres fases
  // ---------------------------------------------------------------------------

  async analyze(): Promise<void> {
    const file = this.file();
    if (!file || this.running() || this.compressing()) return;

    this.error.set(null);
    this.clearResults();

    try {
      // Fase 1 — visión: contenido principal de la imagen.
      this.phase1.set('running');
      const step1 = await firstValueFrom(
        this.ai.analyzeImageContent(file, { idioma: 'es', enfoque: this.enfoque() }),
      );
      this.content.set(step1.contenido);
      this.meta1.set(step1.meta);
      this.phase1.set('done');

      // Fase 2 — prompt interno a partir del contenido (sin la imagen).
      this.phase2.set('running');
      const step2 = await firstValueFrom(
        this.ai.buildImageInternalPrompt(step1.contenido, {
          idioma: 'es',
          enfoque: this.enfoque(),
        }),
      );
      this.prompt.set(step2.promptInterno);
      this.meta2.set(step2.meta);
      this.phase2.set('done');

      // Fase 3 — detalle usando el prompt interno + el contenido.
      this.phase3.set('running');
      const step3 = await firstValueFrom(
        this.ai.buildImageDetail(step2.promptInterno, step1.contenido),
      );
      this.detail.set(step3.detalle);
      this.meta3.set(step3.meta);
      this.phase3.set('done');
    } catch (err) {
      this.error.set(
        apiErrorMessage(err, 'No pudimos completar el análisis de la imagen.'),
      );
      if (this.phase1() === 'running') this.phase1.set('error');
      else if (this.phase2() === 'running') this.phase2.set('error');
      else if (this.phase3() === 'running') this.phase3.set('error');
    }
  }

  reset(): void {
    if (this.running()) return;
    this.clearResults();
    this.error.set(null);
  }

  /** Reintenta solo la fase 2 (no vuelve a enviar la imagen). */
  async retryPhase2(): Promise<void> {
    const content = this.content();
    if (!content || this.running()) return;

    this.error.set(null);
    this.prompt.set(null);
    this.meta2.set(null);
    this.detail.set(null);
    this.meta3.set(null);
    this.phase3.set('idle');
    this.phase2.set('running');

    try {
      const step2 = await firstValueFrom(
        this.ai.buildImageInternalPrompt(content, {
          idioma: 'es',
          enfoque: this.enfoque(),
        }),
      );
      this.prompt.set(step2.promptInterno);
      this.meta2.set(step2.meta);
      this.phase2.set('done');
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'No pudimos construir el prompt interno.'));
      this.phase2.set('error');
    }
  }

  /** Reintenta solo la fase 3 con el prompt interno y el contenido ya obtenidos. */
  async retryPhase3(): Promise<void> {
    const content = this.content();
    const prompt = this.prompt();
    if (!content || !prompt || this.running()) return;

    this.error.set(null);
    this.detail.set(null);
    this.meta3.set(null);
    this.phase3.set('running');

    try {
      const step3 = await firstValueFrom(this.ai.buildImageDetail(prompt, content));
      this.detail.set(step3.detalle);
      this.meta3.set(step3.meta);
      this.phase3.set('done');
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'No pudimos generar el detalle.'));
      this.phase3.set('error');
    }
  }

  private clearResults(): void {
    this.phase1.set('idle');
    this.phase2.set('idle');
    this.phase3.set('idle');
    this.content.set(null);
    this.prompt.set(null);
    this.detail.set(null);
    this.meta1.set(null);
    this.meta2.set(null);
    this.meta3.set(null);
  }

  // ---------------------------------------------------------------------------
  // Utilidades de presentación
  // ---------------------------------------------------------------------------

  formatBytes(bytes: number): string {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  stepLabel(state: StepState): string {
    switch (state) {
      case 'running':
        return 'Analizando…';
      case 'done':
        return 'Completada';
      case 'error':
        return 'Error';
      default:
        return 'Pendiente';
    }
  }

  metaLabel(meta: ImagePhaseMeta | null): string {
    if (!meta) return '';
    const seconds = Math.max(1, Math.round(meta.duracionMs / 1000));
    const tokens = meta.tokensUsados ? ` · ${meta.tokensUsados} tokens` : '';
    return `${meta.modelo} · ${seconds}s${tokens}`;
  }
}
