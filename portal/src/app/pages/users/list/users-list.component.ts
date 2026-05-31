import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, User } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, RouterLink, MatTableModule, MatButtonModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Users</h1>
        <button *ngIf="auth.has('user:create')" mat-raised-button color="primary" routerLink="/users/new">+ Create User</button>
      </div>
      <span class="muted" *ngIf="total >= 0">{{ total }} total</span>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="username">
          <mat-header-cell *matHeaderCellDef>Username</mat-header-cell>
          <mat-cell *matCellDef="let u" style="font-weight:500">{{ u.username }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="displayName">
          <mat-header-cell *matHeaderCellDef>Name</mat-header-cell>
          <mat-cell *matCellDef="let u">{{ u.displayName || '—' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="email">
          <mat-header-cell *matHeaderCellDef>Email</mat-header-cell>
          <mat-cell *matCellDef="let u">{{ u.email }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="isActive">
          <mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
          <mat-cell *matCellDef="let u"><status-badge [status]="u.isActive ? 'ACTIVE' : 'INACTIVE'"></status-badge></mat-cell>
        </ng-container>
        <ng-container matColumnDef="createdAt">
          <mat-header-cell *matHeaderCellDef>Created</mat-header-cell>
          <mat-cell *matCellDef="let u">{{ u.createdAt | date:'dd MMM yyyy' }}</mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let u; columns: cols" class="clickable-row" (click)="open(u)"></mat-row>
      </mat-table>

      <div *ngIf="!loading && rows.length === 0" class="muted" style="text-align:center;padding:40px">No users found.</div>
    </div>
  `,
})
export class UsersListComponent implements OnInit {
  cols = ['username', 'displayName', 'email', 'isActive', 'createdAt'];
  rows: User[] = [];
  total = -1;
  loading = false;

  constructor(private api: ApiService, private router: Router, public auth: AuthService) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.listUsers(100, 0).subscribe({
      next: (p) => { this.rows = p.items; this.total = p.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
  open(u: User) { this.router.navigate(['/users', u.id]); }
}
