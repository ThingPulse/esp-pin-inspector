import { Injectable } from '@angular/core';
import { PinDefinition, ReservedInfo } from '../models';

export interface PinWarning {
  level: 'info' | 'warn' | 'error';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class WarningService {
  getWarnings(pin: PinDefinition): PinWarning[] {
    const warnings: PinWarning[] = [];
    if (pin.reserved) {
      warnings.push(this.fromReserved(pin.reserved));
    }
    return warnings;
  }

  private fromReserved(res: ReservedInfo): PinWarning {
    const tags = res.tags && res.tags.length ? ` [${res.tags.join(', ')}]` : '';
    const reason = res.reason ? ` – ${res.reason}` : '';
    return {
      level: res.level,
      message: `Reserved${tags}${reason}`.trim()
    };
  }
}

