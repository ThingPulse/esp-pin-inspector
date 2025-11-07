import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { ChipDefinition } from '../models';

@Injectable({ providedIn: 'root' })
export class ChipDataService {
  private cache = new Map<string, Observable<ChipDefinition>>();

  constructor(private http: HttpClient) {}

  loadChip(chipId: string): Observable<ChipDefinition> {
    if (!this.cache.has(chipId)) {
      const req = this.http
        .get<ChipDefinition>(`assets/chips/${chipId}/chip.json`)
        .pipe(shareReplay(1));
      this.cache.set(chipId, req);
    }
    return this.cache.get(chipId)!;
  }
}

