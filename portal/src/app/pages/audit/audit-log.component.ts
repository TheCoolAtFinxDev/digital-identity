import { Component, OnInit } from '@angular/core';
import { NgIf, NgFor, DatePipe, JsonPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, AuditEntry, AuditPage } from '../../core/api.service';

const EVENTS = [
  'REQUEST_CREATED', 'CERTIFICATE_ISSUED', 'REQUEST_REJECTED', 'CERTIFICATE_VIEWED',
  'CERTIFICATE_REVOKED', 'VERIFICATION_PERFORMED', 'ENTITY_CREATED', 'ENTITY_TYPE_SET',
  'ENTITY_STATUS_CHANGED', 'KYC_STATUS_UPDATED', 'PROFILE_CREATED', 'PROFILE_UPDATED',
  'CASE_CREATED', 'CASE_SUBMITTED', 'CASE_REVIEWED', 'CASE_APPROVED', 'CASE_REJECTED', 'CASE_WITHDRAWN',
  'EVIDENCE_UPLOADED', 'EVIDENCE_DELETED', 'RELATIONSHIP_CREATED', 'RELATIONSHIP_UPDATED', 'RELATIONSHIP_STATUS_CHANGED',
  'USER_CREATED', 'USER_DEACTIVATED', 'ROLE_ASSIGNED', 'ROLE_REVOKED', 'PERMISSION_CHECK_FAILED',
  'OBJECT_CREATED', 'OBJECT_VIEWED', 'LOGIN_SUCCESS', 'LOGIN_FAILED',
];

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, JsonPipe, SlicePipe, FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container" style="max-width:1300px">
      <div class="page-header">
        <h1>Audit Log</h1>
        <span class="muted" *ngIf="total >= 0">{{ total }} total events</span>
      </div>

      <div class="inline-actions" style="margin-bottom:16px">
        <mat-form-field appearance="outline" style="width:260px">
          <mat-label>Event Type</mat-label>
          <mat-select [(ngModel)]="eventFilter" (ngModelChange)="load()">
            <mat-option value="">All events</mat-option>
            <mat-option *ngFor="let e of events" [value]="e">{{ e }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:280px">
          <mat-label>Entity ID</mat-label>
          <input matInput [(ngModel)]="entityFilter" placeholder="entity UUID">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:170px">
          <mat-label>From</mat-label>
          <input matInput type="date" [(ngModel)]="fromFilter">
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:170px">
          <mat-label>To</mat-label>
          <input matInput type="date" [(ngModel)]="toFilter">
        </mat-form-field>
        <button mat-raised-button color="primary" (click)="load()">Apply</button>
        <button mat-stroked-button (click)="clear()">Clear</button>
        <button mat-stroked-button (click)="loadMore()" *ngIf="rows.length < total">Load more</button>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="createdAt">
          <mat-header-cell *matHeaderCellDef style="min-width:150px">Time</mat-header-cell>
          <mat-cell *matCellDef="let e" style="font-size:12px">{{ e.createdAt | date:'dd MMM HH:mm:ss' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="event">
          <mat-header-cell *matHeaderCellDef>Event</mat-header-cell>
          <mat-cell *matCellDef="let e"><span class="badge" [class]="'badge ' + eventClass(e.event)" style="font-size:10px">{{ e.event }}</span></mat-cell>
        </ng-container>
        <ng-container matColumnDef="userId">
          <mat-header-cell *matHeaderCellDef>User</mat-header-cell>
          <mat-cell *matCellDef="let e" style="font-size:11px;font-family:monospace">{{ e.userId ? (e.userId | slice:0:8) + '…' : '—' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="entityId">
          <mat-header-cell *matHeaderCellDef>Entity</mat-header-cell>
          <mat-cell *matCellDef="let e" style="font-size:11px;font-family:monospace">{{ e.entityId ? (e.entityId | slice:0:8) + '…' : '—' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="detail">
          <mat-header-cell *matHeaderCellDef>Detail</mat-header-cell>
          <mat-cell *matCellDef="let e" style="font-size:11px;font-family:monospace;color:rgba(0,0,0,0.6)">{{ e.detail ? (e.detail | json | slice:0:90) : '—' }}</mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let e; columns: cols" class="clickable-row" (click)="selected = e"></mat-row>
      </mat-table>

      <div *ngIf="selected" style="margin-top:16px">
        <h3>Detail — {{ selected.event }} <button mat-button (click)="selected = null">close</button></h3>
        <div class="json-box">{{ selected.detail | json }}</div>
      </div>

      <div *ngIf="!loading && rows.length === 0" class="muted" style="text-align:center;padding:40px">No audit events found.</div>
    </div>
  `,
})
export class AuditLogComponent implements OnInit {
  cols = ['createdAt', 'event', 'userId', 'entityId', 'detail'];
  rows: AuditEntry[] = [];
  total = -1;
  loading = false;
  eventFilter = '';
  entityFilter = '';
  fromFilter = '';
  toFilter = '';
  page = 1;
  events = EVENTS;
  selected: AuditEntry | null = null;

  constructor(private api: ApiService) {}
  ngOnInit() { this.load(); }

  private opts(page: number) {
    return {
      page, limit: 50,
      event: this.eventFilter || undefined,
      entityId: this.entityFilter.trim() || undefined,
      from: this.fromFilter || undefined,
      to: this.toFilter || undefined,
    };
  }

  load() {
    this.page = 1;
    this.loading = true;
    this.selected = null;
    this.api.listAuditLogs(this.opts(1)).subscribe({
      next: (p: AuditPage) => { this.rows = p.data; this.total = p.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  loadMore() {
    this.page++;
    this.api.listAuditLogs(this.opts(this.page)).subscribe({
      next: (p: AuditPage) => { this.rows = [...this.rows, ...p.data]; },
    });
  }

  clear() { this.eventFilter = ''; this.entityFilter = ''; this.fromFilter = ''; this.toFilter = ''; this.load(); }

  eventClass(event: string) {
    if (['CERTIFICATE_ISSUED', 'ENTITY_CREATED', 'OBJECT_CREATED', 'CASE_APPROVED', 'USER_CREATED', 'ROLE_ASSIGNED', 'RELATIONSHIP_CREATED', 'PROFILE_CREATED', 'EVIDENCE_UPLOADED', 'LOGIN_SUCCESS'].includes(event)) return 'b-approved';
    if (['REQUEST_REJECTED', 'CERTIFICATE_REVOKED', 'CASE_REJECTED', 'USER_DEACTIVATED', 'ROLE_REVOKED', 'PERMISSION_CHECK_FAILED', 'LOGIN_FAILED', 'EVIDENCE_DELETED'].includes(event)) return 'b-rejected';
    if (['CASE_UNDER_REVIEW', 'CASE_REVIEWED'].includes(event)) return 'b-review';
    return 'b-pending';
  }
}
