import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MiniGamesPage } from './mini-games.page';

const routes: Routes = [
  {
    path: '',
    component: MiniGamesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MiniGamesPageRoutingModule {}
