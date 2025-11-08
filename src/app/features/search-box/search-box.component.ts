import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { SelectionService } from '../../core/services/selection.service';

@Component({
  selector: 'app-search-box',
  templateUrl: './search-box.component.html',
  styleUrls: ['./search-box.component.css']
})
export class SearchBoxComponent implements OnInit, OnDestroy {
  query = '';
  private sub = new Subscription();

  constructor(private selection: SelectionService) {}

  ngOnInit(): void {
    this.sub.add(
      this.selection.searchFilter$.subscribe(query => {
        this.query = query;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onQueryChange(value: string): void {
    this.selection.setSearchFilter(value);
  }
}

