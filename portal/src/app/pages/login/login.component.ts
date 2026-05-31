import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgIf, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5">
      <mat-card style="width:360px;padding:8px">
        <mat-card-header>
          <mat-card-title style="font-size:20px">Digital Identity Portal</mat-card-title>
          <mat-card-subtitle>Sign in to continue</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content style="margin-top:16px">
          <form (ngSubmit)="submit()" #f="ngForm">
            <mat-form-field appearance="outline" style="width:100%">
              <mat-label>Username</mat-label>
              <input matInput name="username" [(ngModel)]="username" required autocomplete="username">
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:100%;margin-top:4px">
              <mat-label>Password</mat-label>
              <input matInput type="password" name="password" [(ngModel)]="password" required autocomplete="current-password">
            </mat-form-field>
            <div *ngIf="error" style="color:#c62828;font-size:13px;margin-bottom:12px">{{ error }}</div>
            <button mat-raised-button color="primary" type="submit" style="width:100%" [disabled]="loading">
              <mat-spinner diameter="18" *ngIf="loading" style="display:inline-block;margin-right:8px"></mat-spinner>
              Sign In
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';

  constructor(private api: ApiService, private auth: AuthService, private router: Router) {}

  submit() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.api.login(this.username, this.password).subscribe({
      next: (res) => {
        this.auth.setToken(res.accessToken);
        this.auth.loadPermissions();
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.error = 'Invalid username or password.';
        this.loading = false;
      },
    });
  }
}
