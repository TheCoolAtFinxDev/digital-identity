import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  constructor(private snack: MatSnackBar) {}

  success(msg: string) { this.open(msg, 'snack-ok'); }
  error(msg: string) { this.open(msg, 'snack-err'); }
  info(msg: string) { this.open(msg, 'snack-info'); }

  /** Extract a friendly message from an HttpErrorResponse-shaped object. */
  fromError(err: any, fallback = 'Something went wrong'): string {
    const m = err?.error?.message ?? err?.message;
    if (Array.isArray(m)) return m.join('; ');
    return typeof m === 'string' && m ? m : fallback;
  }

  private open(msg: string, panel: string) {
    this.snack.open(msg, 'Dismiss', { duration: 5000, panelClass: [panel], horizontalPosition: 'right', verticalPosition: 'top' });
  }
}
