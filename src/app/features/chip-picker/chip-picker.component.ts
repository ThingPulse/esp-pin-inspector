import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-chip-picker',
  templateUrl: './chip-picker.component.html',
  styleUrls: ['./chip-picker.component.css']
})
export class ChipPickerComponent {
  @Input() chips: { id: string; name: string }[] = [];
  @Input() selectedId: string | null = null;
  @Output() select = new EventEmitter<string>();
}

