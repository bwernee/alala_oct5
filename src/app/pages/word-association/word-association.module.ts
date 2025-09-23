import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { WordAssociationPageRoutingModule } from './word-association-routing.module';

import { WordAssociationPage } from './word-association.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WordAssociationPageRoutingModule
  ],
  declarations: [WordAssociationPage]
})
export class WordAssociationPageModule {}