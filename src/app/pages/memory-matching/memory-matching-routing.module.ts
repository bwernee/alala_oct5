import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MemoryMatchingPage } from './memory-matching.page';

const routes: Routes = [
  {
    path: '',
    component: MemoryMatchingPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MemoryMatchingPageRoutingModule {}