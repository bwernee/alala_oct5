import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddFlashcardPageRoutingModule } from './add-flashcard-routing.module';

import { AddFlashcardPage } from './add-flashcard.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddFlashcardPageRoutingModule
  ],
  declarations: [AddFlashcardPage]
})
export class AddFlashcardPageModule {}
