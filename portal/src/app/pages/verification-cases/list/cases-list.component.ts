import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, VerificationCase } from '../../../core/api.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-cases-list',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container">
      <div class="page-header"><h1>Verification Cases</h1></div>

      <div class="inline-actions" style="margin-bottom:16px">
        <mat-form-field appearance="outline" style="width:200px">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="statusFilter" (ngModelChange)="load()">
            <mat-option value="">All</mat-option>
            <mat-option *ngFor="let s of statuses" [value]="s">{{ s }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:160px">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="typeFilter" (ngModelChange)="load()">
            <mat-option value="">All</mat-option>
            <mat-option value="KYC">KYC</mat-option>
            <mat-option value="KYB">KYB</mat-option>
            <mat-option value="RE_VERIFICATION">RE_VERIFICATION</mat-option>
          </mat-select>
        </mat-form-field>
        <span class="muted" *ngIf="total >= 0">{{ total }} total</span>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="entity"><mat-header-cell *matHeaderCellDef>Entity</mat-header-cell>
          <mat-cell *matCellDef="let c" style="font-weight:500">{{ c.entity?.name || c.entityId }}</mat-cell></ng-container>
        <ng-container matColumnDef="caseType"><mat-header-cell *matHeaderCellDef>Type</mat-header-cell>
          <mat-cell *matCellDef="let c">{{ c.caseType }}</mat-cell></ng-container>
        <ng-container matColumnDef="status"><mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
          <mat-cell *matCellDef="let c"><status-badge [status]="c.status"></status-badge></mat-cell></ng-container>
        <ng-container matColumnDef="evidence"><mat-header-cell *matHeaderCellDef>Evidence</mat-header-cell>
          <mat-cell *matCellDef="let c">{{ c._count?.evidence ?? 0 }}</mat-cell></ng-container>
        <ng-container matColumnDef="createdAt"><mat-header-cell *matHeaderCellDef>Created</mat-header-cell>
          <mat-cell *matCellDef="let c">{{ c.createdAt | date:'dd MMM yyyy' }}</mat-cell></ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let c; columns: cols" class="clickable-row" (click)="open(c)"></mat-row>
      </mat-table>

      <div *ngIf="!loading && rows.length === 0" class="muted" style="text-align:center;padding:40px">No verification cases found.</div>
    </div>
  `,
})
export class CasesListComponent implements OnInit {
  cols = ['entity', 'caseType', 'status', 'evidence', 'createdAt'];
  statuses = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
  rows: VerificationCase[] = [];
  total = -1;
  loading = false;
  statusFilter = '';
  typeFilter = '';

  constructor(private api: ApiService, private router: Router) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.listCases({ status: this.statusFilter || undefined, caseType: this.typeFilter || undefined }).subscribe({
      next: (p) => { this.rows = p.items; this.total = p.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
  open(c: VerificationCase) { this.router.navigate(['/verification-cases', c.id]); }
}
