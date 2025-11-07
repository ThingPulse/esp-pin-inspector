import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-function-filter',
  templateUrl: './function-filter.component.html',
  styleUrls: ['./function-filter.component.css']
})
export class FunctionFilterComponent {
  @Input() kinds: string[] = [];
  @Input() selected: string | null = null;
  @Output() change = new EventEmitter<string | null>();
}

