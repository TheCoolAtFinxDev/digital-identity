import { Component, OnInit } from '@angular/core';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, Relationship, Entity } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

@Component({
  selector: 'app-relationships',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, FormsModule, MatCardModule, MatTableModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Entity Relationships</h1>
        <button *ngIf="auth.has('relationship:create')" mat-raised-button color="primary" (click)="showCreate = !showCreate">+ New Relationship</button>
      </div>

      <mat-card *ngIf="showCreate" style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Create Relationship</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
          <mat-form-field appearance="outline">
            <mat-label>Subject entity</mat-label>
            <mat-select [(ngModel)]="form.subjectEntityId">
              <mat-option *ngFor="let e of entities" [value]="e.id">{{ e.name }} ({{ e.entityType }})</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Object entity</mat-label>
            <mat-select [(ngModel)]="form.objectEntityId">
              <mat-option *ngFor="let e of entities" [value]="e.id">{{ e.name }} ({{ e.entityType }})</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Relationship type</mat-label>
            <mat-select [(ngModel)]="form.relationshipType">
              <mat-option *ngFor="let t of types" [value]="t">{{ t }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" *ngIf="isOwnership()">
            <mat-label>Ownership %</mat-label>
            <input matInput type="number" [(ngModel)]="form.ownershipPercent" min="0.001" max="100">
          </mat-form-field>
          <mat-form-field appearance="outline" style="grid-column:1/3">
            <mat-label>Notes (optional)</mat-label>
            <input matInput [(ngModel)]="form.notes">
          </mat-form-field>
        </div>
        <div class="inline-actions">
          <button mat-raised-button color="primary" [disabled]="!canCreate() || saving" (click)="create()">Create</button>
          <button mat-stroked-button (click)="showCreate = false">Cancel</button>
        </div>
        <p class="muted" style="margin-top:8px">Ownership % is only valid for SHAREHOLDER_OF and BENEFICIAL_OWNER_OF. Subject and object must differ.</p>
      </mat-card-content></mat-card>

      <div class="inline-actions" style="margin-bottom:16px">
        <mat-form-field appearance="outline" style="width:200px">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="statusFilter" (ngModelChange)="load()">
            <mat-option value="">All</mat-option>
            <mat-option value="ACTIVE">Active</mat-option>
            <mat-option value="INACTIVE">Inactive</mat-option>
            <mat-option value="PENDING_VERIFICATION">Pending verification</mat-option>
          </mat-select>
        </mat-form-field>
        <span class="muted" *ngIf="total >= 0">{{ total }} total</span>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <mat-table [dataSource]="rows" *ngIf="!loading">
        <ng-container matColumnDef="subject"><mat-header-cell *matHeaderCellDef>Subject</mat-header-cell>
          <mat-cell *matCellDef="let r" style="font-weight:500">{{ r.subjectEntity?.name }}</mat-cell></ng-container>
        <ng-container matColumnDef="type"><mat-header-cell *matHeaderCellDef>Type</mat-header-cell>
          <mat-cell *matCellDef="let r"><span class="badge b-neutral">{{ r.relationshipType }}</span></mat-cell></ng-container>
        <ng-container matColumnDef="object"><mat-header-cell *matHeaderCellDef>Object</mat-header-cell>
          <mat-cell *matCellDef="let r" style="font-weight:500">{{ r.objectEntity?.name }}</mat-cell></ng-container>
        <ng-container matColumnDef="ownership"><mat-header-cell *matHeaderCellDef>Own %</mat-header-cell>
          <mat-cell *matCellDef="let r">{{ r.ownershipPercent != null ? r.ownershipPercent + '%' : '—' }}</mat-cell></ng-container>
        <ng-container matColumnDef="status"><mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
          <mat-cell *matCellDef="let r"><status-badge [status]="r.status"></status-badge></mat-cell></ng-container>
        <ng-container matColumnDef="actions"><mat-header-cell *matHeaderCellDef></mat-header-cell>
          <mat-cell *matCellDef="let r">
            <button *ngIf="r.status === 'ACTIVE' && auth.has('relationship:deactivate')" mat-button color="warn" (click)="deactivate(r)">Deactivate</button>
          </mat-cell></ng-container>
        <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
        <mat-row *matRowDef="let r; columns: cols"></mat-row>
      </mat-table>

      <div *ngIf="!loading && rows.length === 0" class="muted" style="text-align:center;padding:40px">No relationships found.</div>
    </div>
  `,
})
export class RelationshipsComponent implements OnInit {
  cols = ['subject', 'type', 'object', 'ownership', 'status', 'actions'];
  rows: Relationship[] = [];
  entities: Entity[] = [];
  total = -1;
  loading = false;
  statusFilter = '';
  showCreate = false;
  saving = false;
  types = ['EMPLOYEE_OF', 'CUSTOMER_OF', 'VENDOR_OF', 'DIRECTOR_OF', 'SHAREHOLDER_OF', 'BENEFICIAL_OWNER_OF',
    'AUTHORIZED_REPRESENTATIVE_OF', 'AUTHORIZED_SIGNER_OF', 'ADMIN_OF', 'ISSUER_FOR', 'DELEGATED_OPERATOR_OF',
    'SERVICE_PROVIDER_OF', 'SUBSIDIARY_OF', 'PARENT_OF', 'AFFILIATED_WITH', 'OTHER'];
  form: any = { subjectEntityId: '', objectEntityId: '', relationshipType: '', ownershipPercent: null, notes: '' };

  constructor(private api: ApiService, public auth: AuthService, private notify: NotifyService) {}

  ngOnInit() {
    this.load();
    this.api.listEntities(1, 100).subscribe({ next: (p) => this.entities = p.data, error: () => {} });
  }

  load() {
    this.loading = true;
    this.api.listRelationships({ status: this.statusFilter || undefined }).subscribe({
      next: (p) => { this.rows = p.items; this.total = p.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  isOwnership() { return this.form.relationshipType === 'SHAREHOLDER_OF' || this.form.relationshipType === 'BENEFICIAL_OWNER_OF'; }
  canCreate() {
    return this.form.subjectEntityId && this.form.objectEntityId
      && this.form.subjectEntityId !== this.form.objectEntityId && this.form.relationshipType;
  }

  create() {
    this.saving = true;
    const body: any = {
      subjectEntityId: this.form.subjectEntityId, objectEntityId: this.form.objectEntityId,
      relationshipType: this.form.relationshipType,
    };
    if (this.isOwnership() && this.form.ownershipPercent) body.ownershipPercent = Number(this.form.ownershipPercent);
    if (this.form.notes) body.notes = this.form.notes;
    this.api.createRelationship(body).subscribe({
      next: () => { this.notify.success('Relationship created'); this.saving = false; this.showCreate = false;
        this.form = { subjectEntityId: '', objectEntityId: '', relationshipType: '', ownershipPercent: null, notes: '' }; this.load(); },
      error: (e: any) => { this.notify.error(this.notify.fromError(e, 'Could not create relationship')); this.saving = false; },
    });
  }

  deactivate(r: Relationship) {
    this.api.deactivateRelationship(r.id).subscribe({
      next: () => { this.notify.success('Relationship deactivated'); this.load(); },
      error: (e: any) => this.notify.error(this.notify.fromError(e, 'Could not deactivate')),
    });
  }
}
