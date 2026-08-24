import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { errorInterceptor } from './core/error.interceptor';
import { FixtureStaffApi, StaffApi } from './staff/staff-api.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimations(),
    importProvidersFrom(MatSnackBarModule),
    // The staff screens are built against the StaffApi contract. Fixtures back
    // it until the S4/S5 endpoints exist; swap this one line for HttpStaffApi
    // when they do — no component changes.
    { provide: StaffApi, useClass: FixtureStaffApi },
  ],
};
