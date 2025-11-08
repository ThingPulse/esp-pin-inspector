import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { ChipDefinition } from '../models';

export interface ChipIndexEntry {
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class ChipDataService {
  private cache = new Map<string, Observable<ChipDefinition>>();
  private chipsIndex$?: Observable<ChipIndexEntry[]>;

  constructor(private http: HttpClient) {}

  loadChipsIndex(): Observable<ChipIndexEntry[]> {
    if (!this.chipsIndex$) {
      this.chipsIndex$ = this.http
        .get<ChipIndexEntry[]>('assets/chips/chips-index.json')
        .pipe(shareReplay(1));
    }
    return this.chipsIndex$;
  }

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

