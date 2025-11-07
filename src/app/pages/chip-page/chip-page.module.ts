import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ChipPageRoutingModule } from './chip-page.routing';
import { ChipPageComponent } from './chip-page.component';
import { ChipPickerComponent } from '../../features/chip-picker/chip-picker.component';
import { PinCanvasComponent } from '../../features/pin-canvas/pin-canvas.component';
import { PinDetailsComponent } from '../../features/pin-details/pin-details.component';
import { FunctionFilterComponent } from '../../features/function-filter/function-filter.component';
import { SearchBoxComponent } from '../../features/search-box/search-box.component';

@NgModule({
  declarations: [
    ChipPageComponent,
    ChipPickerComponent,
    PinCanvasComponent,
    PinDetailsComponent,
    FunctionFilterComponent,
    SearchBoxComponent
  ],
  imports: [CommonModule, FormsModule, HttpClientModule, ChipPageRoutingModule]
})
export class ChipPageModule {}

