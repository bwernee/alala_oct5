import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PhotoMemoriesPage } from './photo-memories.page';

describe('PhotoMemoriesPage', () => {
  let component: PhotoMemoriesPage;
  let fixture: ComponentFixture<PhotoMemoriesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PhotoMemoriesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
