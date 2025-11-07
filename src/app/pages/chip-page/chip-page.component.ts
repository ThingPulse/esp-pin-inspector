import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, switchMap, of } from 'rxjs';
import { ChipDataService } from '../../core/services/chip-data.service';
import { SelectionService } from '../../core/services/selection.service';
import { ChipDefinition, PinDefinition } from '../../core/models';

@Component({
  selector: 'app-chip-page',
  templateUrl: './chip-page.component.html',
  styleUrls: ['./chip-page.component.css']
})
export class ChipPageComponent implements OnInit, OnDestroy {
  chip: ChipDefinition | null = null;
  selectedPin: PinDefinition | null = null;
  private sub = new Subscription();

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private data: ChipDataService,
    public sel: SelectionService
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.route.paramMap
        .pipe(
          switchMap(params => {
            const chipId = params.get('chipId');
            if (chipId) {
              this.sel.setChipId(chipId);
              return this.data.loadChip(chipId);
            }
            return of(null);
          })
        )
        .subscribe(chip => (this.chip = chip))
    );

    this.sub.add(
      this.route.queryParamMap.subscribe(q => {
        const pinId = q.get('pin');
        if (pinId && this.chip) {
          this.selectedPin = this.chip.pins.find(p => p.id === pinId) || null;
        }
      })
    );
  }

  onPinClick(pin: PinDefinition): void {
    this.selectedPin = pin;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pin: pin.id },
      queryParamsHandling: 'merge'
    });
  }

  get editorEnabled(): boolean {
    return typeof window !== 'undefined' && window.location.hash.includes('editor');
  }

  onPinUpdate(update: { pinId: string; area: { x: number; y: number; w: number; h: number } }): void {
    if (!this.chip) return;
    const pin = this.chip.pins.find(p => p.id === update.pinId);
    if (pin) {
      pin.area = { ...update.area };
      // Log updated pin JSON for easy copy-paste
      // eslint-disable-next-line no-console
      console.log(`Updated pin ${update.pinId}:`, JSON.stringify(pin, null, 2));
    }
  }

  downloadChipJson(): void {
    if (!this.chip) return;
    const json = JSON.stringify(this.chip, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chip.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}

