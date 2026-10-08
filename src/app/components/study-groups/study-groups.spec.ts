import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { StudyGroups } from './study-groups';

describe('StudyGroups', () => {
  let component: StudyGroups;
  let fixture: ComponentFixture<StudyGroups>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudyGroups],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(StudyGroups);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
