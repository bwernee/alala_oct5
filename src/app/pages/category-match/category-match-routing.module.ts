import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CategoryMatchPage } from './category-match.page';

const routes: Routes = [
  {
    path: '',
    component: CategoryMatchPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CategoryMatchPageRoutingModule {}