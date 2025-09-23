import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FlashcardGamesPage } from './flashcard-games.page';

const routes: Routes = [
  {
    path: '',
    component: FlashcardGamesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FlashcardGamesPageRoutingModule {}