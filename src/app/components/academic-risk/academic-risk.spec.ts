import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AcademicRiskComponent } from './academic-risk';

describe('AcademicRiskComponent', () => {
  let component: AcademicRiskComponent;
  let fixture: ComponentFixture<AcademicRiskComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcademicRiskComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AcademicRiskComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
