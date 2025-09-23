import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MiniGamesPage } from './mini-games.page';

describe('MiniGamesPage', () => {
  let component: MiniGamesPage;
  let fixture: ComponentFixture<MiniGamesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MiniGamesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
