import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CategoryMatchPageRoutingModule } from './category-match-routing.module';

import { CategoryMatchPage } from './category-match.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CategoryMatchPageRoutingModule
  ],
  declarations: [CategoryMatchPage]
})
export class CategoryMatchPageModule {}