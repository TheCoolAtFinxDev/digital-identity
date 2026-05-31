import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, Entity } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-entities-list',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, RouterLink, FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Legal Entities</h1>
        <button *ngIf="auth.has('entity:create')" mat-raised-button color="primary" routerLink="/entities/new">+ Register Entity</button>
      </div>

      <div class="inline-actions" style="margin-bottom:16px">
        <mat-form-field appearance="outline" style="width:200px">
          <mat-label>Filter by KYC</mat-label>
          <mat-select [(ngModel)]="kycFilter" (ngModelChange)="load()">
            <mat-option value="">All</mat-option>
            <mat-option value="PENDING">Pending</mat-option>
            <mat-option value="APPROVED">Approved</mat-option>
            <mat-option value="REJECTED">Rejected</mat-option>
          </mat-select>
        </mat-form-field>
        <span class="muted" *ngIf="total >= 0">{{ total }} total</span>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="name">
          <mat-header-cell *matHeaderCellDef>Name</mat-header-cell>
          <mat-cell *matCellDef="let e" style="font-weight:500">{{ e.name }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="entityType">
          <mat-header-cell *matHeaderCellDef>Type</mat-header-cell>
          <mat-cell *matCellDef="let e"><span class="badge b-neutral">{{ e.entityType }}</span></mat-cell>
        </ng-container>
        <ng-container matColumnDef="country">
          <mat-header-cell *matHeaderCellDef>Country</mat-header-cell>
          <mat-cell *matCellDef="let e">{{ e.country }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="status">
          <mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
          <mat-cell *matCellDef="let e"><status-badge [status]="e.status"></status-badge></mat-cell>
        </ng-container>
        <ng-container matColumnDef="kycStatus">
          <mat-header-cell *matHeaderCellDef>KYC</mat-header-cell>
          <mat-cell *matCellDef="let e"><status-badge [status]="e.kycStatus"></status-badge></mat-cell>
        </ng-container>
        <ng-container matColumnDef="createdAt">
          <mat-header-cell *matHeaderCellDef>Registered</mat-header-cell>
          <mat-cell *matCellDef="let e">{{ e.createdAt | date:'dd MMM yyyy' }}</mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let e; columns: cols" class="clickable-row" (click)="open(e)"></mat-row>
      </mat-table>

      <div *ngIf="!loading && rows.length === 0" class="muted" style="text-align:center;padding:40px">
        No entities found. <a routerLink="/entities/new" *ngIf="auth.has('entity:create')">Register the first one.</a>
      </div>
    </div>
  `,
})
export class EntitiesListComponent implements OnInit {
  cols = ['name', 'entityType', 'country', 'status', 'kycStatus', 'createdAt'];
  rows: Entity[] = [];
  total = -1;
  loading = false;
  kycFilter = '';

  constructor(private api: ApiService, private router: Router, public auth: AuthService) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.listEntities(1, 100, this.kycFilter || undefined).subscribe({
      next: (p) => { this.rows = p.data; this.total = p.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
  open(e: Entity) { this.router.navigate(['/entities', e.id]); }
}
