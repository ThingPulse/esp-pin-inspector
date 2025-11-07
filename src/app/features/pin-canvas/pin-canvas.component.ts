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

  @ViewChild('overlay', { static: false }) overlayRef?: ElementRef<SVGSVGElement>;

  svgContent: SafeHtml | null = null;
  private lastSvgPath: string | null = null;
  private readonly defaultHitSize = 24;

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chip']?.currentValue) {
      this.loadSvg();
    }
  }

  get debugEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('debug');
  }

  get isSvg(): boolean {
    return !!this.chip?.image?.toLowerCase().endsWith('.svg');
  }

  getHitArea(pin: PinDefinition) {
    if (pin.hitArea) {
      return pin.hitArea;
    }
    const size = this.defaultHitSize;
    return {
      x: pin.position.x - size / 2,
      y: pin.position.y - size / 2,
      width: size,
      height: size
    };
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
      hitArea: { x: x - Math.round(size / 2), y: y - Math.round(size / 2), width: size, height: size },
      functions: [ { kind: "GPIO" } ]
    };
    // eslint-disable-next-line no-console
    console.log('Pin JSON snippet (copy into pins[]):', JSON.stringify(snippet, null, 2));
  }

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

