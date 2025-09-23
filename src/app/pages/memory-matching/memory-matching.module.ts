import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MemoryMatchingPageRoutingModule } from './memory-matching-routing.module';

import { MemoryMatchingPage } from './memory-matching.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MemoryMatchingPageRoutingModule
  ],
  declarations: [MemoryMatchingPage]
})
export class MemoryMatchingPageModule {}