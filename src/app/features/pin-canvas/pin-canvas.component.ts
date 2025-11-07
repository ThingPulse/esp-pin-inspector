import { Component, EventEmitter, Input, Output } from '@angular/core';
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
}

