import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { take } from 'rxjs';
import { ChipDefinition, PinDefinition } from '../../core/models';

@Component({
  selector: 'app-pin-canvas',
  templateUrl: './pin-canvas.component.html',
  styleUrls: ['./pin-canvas.component.css']
})
export class PinCanvasComponent implements OnChanges {
  @Input() chip!: ChipDefinition;
  @Input() selectedPinId: string | null = null;
  @Output() pinClick = new EventEmitter<PinDefinition>();
  @Output() pinUpdate = new EventEmitter<{ pinId: string; area: { x: number; y: number; w: number; h: number } }>();

  @ViewChild('overlay', { static: false }) overlayRef?: ElementRef<SVGSVGElement>;

  svgContent: SafeHtml | null = null;
  private lastSvgPath: string | null = null;
  private readonly defaultHitSize = 24;

  editingPin: PinDefinition | null = null;
  private dragState: {
    pin: PinDefinition;
    startX: number;
    startY: number;
    startHitArea: { x: number; y: number; width: number; height: number };
    mode: 'drag' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e';
  } | null = null;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chip']?.currentValue) {
      this.loadSvg();
    }
  }

  get debugEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('debug');
  }

  get editorEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('editor');
  }

  get isSvg(): boolean {
    return !!this.chip?.image?.toLowerCase().endsWith('.svg');
  }

  getHitArea(pin: PinDefinition) {
    if (pin.area) {
      return {
        x: pin.area.x,
        y: pin.area.y,
        width: pin.area.w,
        height: pin.area.h
      };
    }
    const size = this.defaultHitSize;
    return {
      x: pin.position.x - size / 2,
      y: pin.position.y - size / 2,
      width: size,
      height: size
    };
  }

  hasWarning(pin: PinDefinition): boolean {
    return pin.reserved?.level === 'warn' || pin.reserved?.level === 'error';
  }

  onOverlayClick(event: MouseEvent): void {
    if (!this.debugEnabled || !this.chip || !this.overlayRef) return;
    const svg = this.overlayRef.nativeElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = this.chip.viewBox.width / rect.width;
    const scaleY = this.chip.viewBox.height / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    const size = this.defaultHitSize;
    const snippet = {
      id: "PIN_PLACEHOLDER",
      number: "Pxx",
      name: "PIN_PLACEHOLDER",
      position: { x, y },
      area: { x: x - Math.round(size / 2), y: y - Math.round(size / 2), w: size, h: size },
      functions: [ { kind: "GPIO" } ]
    };
    // eslint-disable-next-line no-console
    console.log('Pin JSON snippet (copy into pins[]):', JSON.stringify(snippet, null, 2));
  }

  onPinMouseDown(event: MouseEvent, pin: PinDefinition): void {
    if (!this.editorEnabled) return;
    event.stopPropagation();
    this.editingPin = pin;
    const svg = this.overlayRef?.nativeElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = this.chip.viewBox.width / rect.width;
    const scaleY = this.chip.viewBox.height / rect.height;
    const hitArea = this.getHitArea(pin);
    this.dragState = {
      pin,
      startX: (event.clientX - rect.left) * scaleX,
      startY: (event.clientY - rect.top) * scaleY,
      startHitArea: { ...hitArea },
      mode: 'drag'
    };
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onResizeHandleMouseDown(event: MouseEvent, pin: PinDefinition, mode: string): void {
    if (!this.editorEnabled) return;
    event.stopPropagation();
    this.editingPin = pin;
    const svg = this.overlayRef?.nativeElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = this.chip.viewBox.width / rect.width;
    const scaleY = this.chip.viewBox.height / rect.height;
    const hitArea = this.getHitArea(pin);
    this.dragState = {
      pin,
      startX: (event.clientX - rect.left) * scaleX,
      startY: (event.clientY - rect.top) * scaleY,
      startHitArea: { ...hitArea },
      mode: mode as any
    };
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.dragState || !this.overlayRef) return;
    const svg = this.overlayRef.nativeElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = this.chip.viewBox.width / rect.width;
    const scaleY = this.chip.viewBox.height / rect.height;
    const currentX = (event.clientX - rect.left) * scaleX;
    const currentY = (event.clientY - rect.top) * scaleY;
    const deltaX = currentX - this.dragState.startX;
    const deltaY = currentY - this.dragState.startY;

    let newHitArea = { ...this.dragState.startHitArea };

    if (this.dragState.mode === 'drag') {
      newHitArea.x = Math.round(this.dragState.startHitArea.x + deltaX);
      newHitArea.y = Math.round(this.dragState.startHitArea.y + deltaY);
    } else {
      const { mode, startHitArea } = this.dragState;
      if (mode.includes('n')) {
        newHitArea.y = Math.round(startHitArea.y + deltaY);
        newHitArea.height = Math.max(8, Math.round(startHitArea.height - deltaY));
      }
      if (mode.includes('s')) {
        newHitArea.height = Math.max(8, Math.round(startHitArea.height + deltaY));
      }
      if (mode.includes('w')) {
        newHitArea.x = Math.round(startHitArea.x + deltaX);
        newHitArea.width = Math.max(8, Math.round(startHitArea.width - deltaX));
      }
      if (mode.includes('e')) {
        newHitArea.width = Math.max(8, Math.round(startHitArea.width + deltaX));
      }
    }

    if (!this.dragState.pin.area) {
      this.dragState.pin.area = {
        x: newHitArea.x,
        y: newHitArea.y,
        w: newHitArea.width,
        h: newHitArea.height
      };
    } else {
      this.dragState.pin.area.x = newHitArea.x;
      this.dragState.pin.area.y = newHitArea.y;
      this.dragState.pin.area.w = newHitArea.width;
      this.dragState.pin.area.h = newHitArea.height;
    }
  };

  private onMouseUp = (): void => {
    if (this.dragState && this.dragState.pin.area) {
      this.pinUpdate.emit({
        pinId: this.dragState.pin.id,
        area: { ...this.dragState.pin.area }
      });
      this.dragState = null;
    }
    this.editingPin = null;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  private loadSvg(): void {
    if (!this.chip || !this.isSvg) {
      this.svgContent = null;
      return;
    }
    const path = `assets/chips/${this.chip.chipId}/${this.chip.image}`;
    if (path === this.lastSvgPath && this.svgContent) {
      return;
    }
    this.lastSvgPath = path;
    this.http
      .get(path, { responseType: 'text' })
      .pipe(take(1))
      .subscribe({
        next: svg => {
          this.svgContent = this.sanitizer.bypassSecurityTrustHtml(svg);
        },
        error: () => {
          this.svgContent = null;
          console.error(`Failed to load SVG image at ${path}`);
        }
      });
  }
}

