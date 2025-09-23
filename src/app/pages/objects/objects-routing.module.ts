import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ObjectsPage } from './objects.page';

const routes: Routes = [
  {
    path: '',
    component: ObjectsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ObjectsPageRoutingModule {}