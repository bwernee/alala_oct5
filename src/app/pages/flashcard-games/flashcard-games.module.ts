import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FlashcardGamesPageRoutingModule } from './flashcard-games-routing.module';

import { FlashcardGamesPage } from './flashcard-games.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FlashcardGamesPageRoutingModule
  ],
  declarations: [FlashcardGamesPage]
})
export class FlashcardGamesPageModule {}