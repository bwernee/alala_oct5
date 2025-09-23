import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoMemoriesPage } from './video-memories.page';

describe('VideoMemoriesPage', () => {
  let component: VideoMemoriesPage;
  let fixture: ComponentFixture<VideoMemoriesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(VideoMemoriesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
