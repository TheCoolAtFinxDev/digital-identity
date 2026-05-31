import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ApiService, CertRequestSummary } from '../../../core/api.service';

@Component({
  selector: 'app-requests-list',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, RouterLink, MatTableModule, MatButtonModule, MatChipsModule, MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Certificate Requests</h1>
        <button mat-raised-button color="primary" routerLink="/requests/new">+ New Request</button>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">
        <mat-form-field appearance="outline" style="width:180px">
          <mat-label>Filter by status</mat-label>
          <mat-select [(ngModel)]="statusFilter" (ngModelChange)="load()">
            <mat-option value="">All</mat-option>
            <mat-option value="NEW">New</mat-option>
            <mat-option value="ISSUED">Issued</mat-option>
            <mat-option value="REJECTED">Rejected</mat-option>
          </mat-select>
        </mat-form-field>
        <span style="color:rgba(0,0,0,0.5);font-size:13px" *ngIf="total >= 0">{{ total }} total</span>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px">
        <mat-spinner diameter="36" style="margin:auto"></mat-spinner>
      </div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="status">
          <mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
          <mat-cell *matCellDef="let r">
            <span class="status-chip status-{{r.status}}">{{ r.status }}</span>
          </mat-cell>
        </ng-container>
        <ng-container matColumnDef="profile">
          <mat-header-cell *matHeaderCellDef>Profile</mat-header-cell>
          <mat-cell *matCellDef="let r">{{ r.profile }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="subject">
          <mat-header-cell *matHeaderCellDef>Subject</mat-header-cell>
          <mat-cell *matCellDef="let r" style="font-size:12px;color:rgba(0,0,0,0.7)">{{ r.subject || '—' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="serial">
          <mat-header-cell *matHeaderCellDef>Serial</mat-header-cell>
          <mat-cell *matCellDef="let r">{{ r.certificate?.serial || '—' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="createdAt">
          <mat-header-cell *matHeaderCellDef>Created</mat-header-cell>
          <mat-cell *matCellDef="let r">{{ r.createdAt | date:'dd MMM yyyy HH:mm' }}</mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let r; columns: cols" class="clickable-row" (click)="open(r)"></mat-row>
      </mat-table>

      <div *ngIf="!loading && rows.length === 0" style="text-align:center;padding:40px;color:rgba(0,0,0,0.5)">
        No requests found.
      </div>
    </div>
  `
})
export class RequestsListComponent implements OnInit {
  cols = ['status', 'profile', 'subject', 'serial', 'createdAt'];
  rows: CertRequestSummary[] = [];
  total = -1;
  loading = false;
  statusFilter = '';

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.listRequests(1, 50, this.statusFilter || undefined).subscribe({
      next: (page) => { this.rows = page.data; this.total = page.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  open(r: CertRequestSummary) {
    this.router.navigate(['/requests', r.id]);
  }
}
