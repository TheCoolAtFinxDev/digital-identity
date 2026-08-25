import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { errorInterceptor } from './core/error.interceptor';
import { HttpStaffApi, StaffApi } from './staff/staff-api.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimations(),
    importProvidersFrom(MatSnackBarModule),
    // The staff screens are built against the StaffApi contract. Sprints 4 and 5
    // shipped the endpoints, so this is now the real thing — and swapping it was
    // the one line the contract-first approach promised it would be.
    { provide: StaffApi, useClass: HttpStaffApi },
  ],
};
