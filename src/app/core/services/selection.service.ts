import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  readonly selectedChipId$ = new BehaviorSubject<string | null>(null);
  readonly selectedPinId$ = new BehaviorSubject<string | null>(null);
  readonly functionFilter$ = new BehaviorSubject<string | null>(null);

  setChipId(chipId: string | null): void {
    this.selectedChipId$.next(chipId);
  }

  setPinId(pinId: string | null): void {
    this.selectedPinId$.next(pinId);
  }

  setFunctionFilter(kind: string | null): void {
    this.functionFilter$.next(kind);
  }
}

