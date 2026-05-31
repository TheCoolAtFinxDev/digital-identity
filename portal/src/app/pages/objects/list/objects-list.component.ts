import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, ObjectRecord } from '../../../core/api.service';

const OBJECT_TYPES = ['DOCUMENT', 'TICKET', 'LICENSE', 'APPLICATION', 'CREDENTIAL', 'DIGITAL_ASSET'];

@Component({
  selector: 'app-objects-list',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, RouterLink, FormsModule, MatTableModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Digital Objects</h1>
        <button mat-raised-button color="primary" routerLink="/objects/new">+ Register Object</button>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">
        <mat-form-field appearance="outline" style="width:220px">
          <mat-label>Filter by type</mat-label>
          <mat-select [(ngModel)]="typeFilter" (ngModelChange)="load()">
            <mat-option value="">All</mat-option>
            <mat-option *ngFor="let t of types" [value]="t">{{ t }}</mat-option>
          </mat-select>
        </mat-form-field>
        <span style="color:rgba(0,0,0,0.5);font-size:13px" *ngIf="total >= 0">{{ total }} total</span>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px">
        <mat-spinner diameter="36" style="margin:auto"></mat-spinner>
      </div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="objectType">
          <mat-header-cell *matHeaderCellDef>Type</mat-header-cell>
          <mat-cell *matCellDef="let o">
            <span class="status-chip status-NEW" style="font-size:11px">{{ o.objectType }}</span>
          </mat-cell>
        </ng-container>
        <ng-container matColumnDef="reference">
          <mat-header-cell *matHeaderCellDef>Reference</mat-header-cell>
          <mat-cell *matCellDef="let o" style="font-weight:500">{{ o.reference }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="entityName">
          <mat-header-cell *matHeaderCellDef>Entity</mat-header-cell>
          <mat-cell *matCellDef="let o">{{ o.entityName || '—' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="createdAt">
          <mat-header-cell *matHeaderCellDef>Created</mat-header-cell>
          <mat-cell *matCellDef="let o">{{ o.createdAt | date:'dd MMM yyyy' }}</mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let o; columns: cols" class="clickable-row" (click)="open(o)"></mat-row>
      </mat-table>

      <div *ngIf="!loading && rows.length === 0" style="text-align:center;padding:40px;color:rgba(0,0,0,0.5)">
        No objects registered yet. <a routerLink="/objects/new">Register one.</a>
      </div>
    </div>
  `
})
export class ObjectsListComponent implements OnInit {
  cols = ['objectType', 'reference', 'entityName', 'createdAt'];
  rows: ObjectRecord[] = [];
  total = -1;
  loading = false;
  typeFilter = '';
  types = OBJECT_TYPES;

  constructor(private api: ApiService, private router: Router) {}
  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.listObjects(1, 50, undefined, this.typeFilter || undefined).subscribe({
      next: (p) => { this.rows = p.data; this.total = p.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  open(o: ObjectRecord) { this.router.navigate(['/objects', o.id]); }
}
