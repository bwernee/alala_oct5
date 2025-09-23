import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomCategoryPage } from './custom-category.page';

describe('CustomCategoryPage', () => {
  let component: CustomCategoryPage;
  let fixture: ComponentFixture<CustomCategoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CustomCategoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
