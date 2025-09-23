import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PhotoMemoriesPage } from './photo-memories.page';

const routes: Routes = [
  {
    path: '',
    component: PhotoMemoriesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PhotoMemoriesPageRoutingModule {}
