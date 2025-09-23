import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CustomCategoryPage } from './custom-category.page';

const routes: Routes = [
  {
    path: '',
    component: CustomCategoryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CustomCategoryPageRoutingModule {}
