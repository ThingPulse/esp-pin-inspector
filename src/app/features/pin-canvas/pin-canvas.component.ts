import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ChipDefinition, PinDefinition } from '../../core/models';

@Component({
  selector: 'app-pin-canvas',
  templateUrl: './pin-canvas.component.html',
  styleUrls: ['./pin-canvas.component.css']
})
export class PinCanvasComponent {
  @Input() chip!: ChipDefinition;
  @Input() selectedPinId: string | null = null;
  @Output() pinClick = new EventEmitter<PinDefinition>();

  @ViewChild('overlay', { static: false }) overlayRef?: ElementRef<SVGSVGElement>;

  get debugEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('debug');
  }

  onOverlayClick(event: MouseEvent): void {
    if (!this.debugEnabled || !this.chip || !this.overlayRef) return;
    const svg = this.overlayRef.nativeElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = this.chip.viewBox.width / rect.width;
    const scaleY = this.chip.viewBox.height / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    const snippet = {
      id: "PIN_PLACEHOLDER",
      number: "Pxx",
      name: "PIN_PLACEHOLDER",
      position: { x, y },
      functions: [ { kind: "GPIO" } ]
    };
    // eslint-disable-next-line no-console
    console.log('Pin JSON snippet (copy into pins[]):', JSON.stringify(snippet, null, 2));
  }
}

