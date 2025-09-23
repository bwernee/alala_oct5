import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { VideoMemoriesPage } from './video-memories.page';

const routes: Routes = [
  {
    path: '',
    component: VideoMemoriesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VideoMemoriesPageRoutingModule {}
