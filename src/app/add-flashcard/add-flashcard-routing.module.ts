import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddFlashcardPage } from './add-flashcard.page';

const routes: Routes = [
  {
    path: '',
    component: AddFlashcardPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddFlashcardPageRoutingModule {}
