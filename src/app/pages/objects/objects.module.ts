import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { ObjectsPageRoutingModule } from './objects-routing.module';
import { ObjectsPage } from './objects.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ObjectsPageRoutingModule
  ],
  declarations: [ObjectsPage]
})
export class ObjectsPageModule {}