import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '../../../core/api.service';
import { NotifyService } from '../../../core/notify.service';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [NgIf, FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <div class="page-container form-narrow">
      <div class="page-header"><h1>Create User</h1><a mat-button routerLink="/users">← Back</a></div>
      <mat-card><mat-card-content style="padding-top:16px">
        <form (ngSubmit)="submit()" #f="ngForm">
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Username</mat-label>
            <input matInput name="username" [(ngModel)]="username" required minlength="3" pattern="[a-zA-Z0-9_-]+">
            <mat-hint>Letters, digits, _ and - only</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Email</mat-label>
            <input matInput type="email" name="email" [(ngModel)]="email" required>
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Display name (optional)</mat-label>
            <input matInput name="displayName" [(ngModel)]="displayName">
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Initial password</mat-label>
            <input matInput type="password" name="password" [(ngModel)]="password" required minlength="8">
            <mat-hint>Minimum 8 characters</mat-hint>
          </mat-form-field>
          <button mat-raised-button color="primary" type="submit" [disabled]="f.invalid || saving">Create User</button>
        </form>
      </mat-card-content></mat-card>
    </div>
  `,
})
export class CreateUserComponent {
  username = ''; email = ''; displayName = ''; password = ''; saving = false;
  constructor(private api: ApiService, private router: Router, private notify: NotifyService) {}

  submit() {
    if (this.saving) return;
    this.saving = true;
    this.api.createUser({
      username: this.username, email: this.email, password: this.password,
      displayName: this.displayName || undefined,
    }).subscribe({
      next: (u) => { this.notify.success('User created'); this.router.navigate(['/users', u.id]); },
      error: (e: any) => { this.notify.error(this.notify.fromError(e, 'Could not create user')); this.saving = false; },
    });
  }
}
