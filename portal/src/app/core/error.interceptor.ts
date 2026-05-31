import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { NotifyService } from './notify.service';

/**
 * Centralised HTTP error UX:
 *  401 → session expired, redirect to login
 *  403 → friendly "no permission" toast (UI also hides such actions where it can)
 *  429 → rate-limit toast
 * Other errors are surfaced by the calling component; we re-throw so it can react.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const notify = inject(NotifyService);

  return next(req).pipe(
    catchError((err) => {
      const status = err?.status;
      const onLogin = router.url.startsWith('/login');
      // Don't toast the login attempt itself — the login screen shows its own message
      const isLoginCall = req.url.includes('/v1/auth/login');

      if (status === 401 && !isLoginCall) {
        auth.logout();
        if (!onLogin) router.navigate(['/login']);
      } else if (status === 403) {
        notify.error(notify.fromError(err, 'You do not have permission to perform this action.'));
      } else if (status === 429) {
        notify.error('Too many requests — please wait a moment and try again.');
      }
      return throwError(() => err);
    }),
  );
};
