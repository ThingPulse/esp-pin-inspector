import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChipPageComponent } from './chip-page.component';

const routes: Routes = [
  { path: 'chip/:chipId', component: ChipPageComponent },
  { path: '', pathMatch: 'full', component: ChipPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ChipPageRoutingModule {}

