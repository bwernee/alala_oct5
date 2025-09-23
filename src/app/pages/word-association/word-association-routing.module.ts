import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WordAssociationPage } from './word-association.page';

const routes: Routes = [
  {
    path: '',
    component: WordAssociationPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WordAssociationPageRoutingModule {}