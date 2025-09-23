import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddFlashcardPage } from './add-flashcard.page';

describe('AddFlashcardPage', () => {
  let component: AddFlashcardPage;
  let fixture: ComponentFixture<AddFlashcardPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddFlashcardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
