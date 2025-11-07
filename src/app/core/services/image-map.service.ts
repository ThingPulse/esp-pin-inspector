import { Injectable } from '@angular/core';
import { PinDefinition } from '../models';

@Injectable({ providedIn: 'root' })
export class ImageMapService {
  // Simple hit test: radius in pixels around pin position
  isPointOnPin(
    x: number,
    y: number,
    pin: PinDefinition,
    radius: number = 12
  ): boolean {
    const dx = x - pin.position.x;
    const dy = y - pin.position.y;
    return dx * dx + dy * dy <= radius * radius;
  }
}

