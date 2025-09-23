import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VideoMemoriesPageRoutingModule } from './video-memories-routing.module';

import { VideoMemoriesPage } from './video-memories.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VideoMemoriesPageRoutingModule
  ],
  declarations: [VideoMemoriesPage]
})
export class VideoMemoriesPageModule {}
