import { Component, Input } from '@angular/core';
import { PinDefinition } from '../../core/models';
import { WarningService, PinWarning } from '../../core/services/warning.service';

@Component({
  selector: 'app-pin-details',
  templateUrl: './pin-details.component.html',
  styleUrls: ['./pin-details.component.css']
})
export class PinDetailsComponent {
  @Input() pin: PinDefinition | null = null;

  constructor(private warnings: WarningService) {}

  get pinWarnings(): PinWarning[] {
    return this.pin ? this.warnings.getWarnings(this.pin) : [];
  }
}

