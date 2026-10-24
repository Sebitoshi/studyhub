import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ProfileComponent } from './profile';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resuelve la foto guardada en MongoDB como ruta del backend', () => {
    component.personal = { foto: '/media/avatars/64f1a2b3c4d5e6f789012345?v=ab12cd34ef' };

    expect(component.hasAvatar()).toBe(true);
    expect(component.avatarUrl()).toContain('/media/avatars/64f1a2b3c4d5e6f789012345');
    expect(component.avatarUrl()).toContain('https://study-hub-backend-sigma.vercel.app');
  });

  it('mantiene compatibilidad con fotos antiguas que ya son URLs', () => {
    component.personal = { foto: 'https://res.cloudinary.com/demo/foto.jpg' };
    expect(component.avatarUrl()).toBe('https://res.cloudinary.com/demo/foto.jpg');
  });

  it('cae a las iniciales cuando no hay foto', () => {
    component.personal = { foto: null };
    component.user = { nombre: 'Sebas' };

    expect(component.hasAvatar()).toBe(false);
    expect(component.getInitial()).toBe('S');
  });
});
