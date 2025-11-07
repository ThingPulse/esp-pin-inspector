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

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}

