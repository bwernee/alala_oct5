import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NameThatMemoryPage } from './name-that-memory.page';

describe('NameThatMemoryPage', () => {
  let component: NameThatMemoryPage;
  let fixture: ComponentFixture<NameThatMemoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NameThatMemoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
