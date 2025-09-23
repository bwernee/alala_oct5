import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ColorSequencePage } from './color-sequence.page';

const routes: Routes = [
  {
    path: '',
    component: ColorSequencePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ColorSequencePageRoutingModule {}