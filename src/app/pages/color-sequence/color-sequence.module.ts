import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ColorSequencePageRoutingModule } from './color-sequence-routing.module';

import { ColorSequencePage } from './color-sequence.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ColorSequencePageRoutingModule
  ],
  declarations: [ColorSequencePage]
})
export class ColorSequencePageModule {}