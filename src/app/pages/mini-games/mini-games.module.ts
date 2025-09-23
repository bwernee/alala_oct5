import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MiniGamesPageRoutingModule } from './mini-games-routing.module';

import { MiniGamesPage } from './mini-games.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MiniGamesPageRoutingModule
  ],
  declarations: [MiniGamesPage]
})
export class MiniGamesPageModule {}
