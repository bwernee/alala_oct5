import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { NameThatMemoryPage } from './name-that-memory.page';

const routes: Routes = [
  {
    path: '',
    component: NameThatMemoryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NameThatMemoryPageRoutingModule {}
