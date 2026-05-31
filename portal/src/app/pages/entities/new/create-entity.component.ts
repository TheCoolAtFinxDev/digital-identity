import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/api.service';
import { NotifyService } from '../../../core/notify.service';

@Component({
  selector: 'app-create-entity',
  standalone: true,
  imports: [FormsModule, NgIf, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container form-narrow">
      <div style="margin-bottom:16px"><a mat-button routerLink="/entities" style="padding-left:0">&larr; Back to Entities</a></div>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:500">Register Legal Entity</h1>

      <mat-card><mat-card-content style="padding-top:16px">
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Entity Type</mat-label>
          <mat-select [(ngModel)]="entityType">
            <mat-option value="ORGANISATION">Organisation</mat-option>
            <mat-option value="PERSON">Person</mat-option>
          </mat-select>
          <mat-hint>Determines whether a person or organisation profile applies, and KYC vs KYB</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" style="width:100%;margin-top:12px">
          <mat-label>{{ entityType === 'PERSON' ? 'Full Name' : 'Entity Name' }}</mat-label>
          <input matInput [(ngModel)]="name" [placeholder]="entityType === 'PERSON' ? 'Jane Doe' : 'Econet Telecom Lesotho (Pty) Ltd'">
        </mat-form-field>

        <mat-form-field appearance="outline" style="width:100%;margin-top:12px">
          <mat-label>Country Code</mat-label>
          <input matInput [(ngModel)]="country" placeholder="LS" maxlength="2" style="text-transform:uppercase">
          <mat-hint>ISO 3166-1 alpha-2 (e.g. LS, ZA, US)</mat-hint>
        </mat-form-field>

        <p class="muted" style="margin:16px 0 8px">
          After registration, complete the {{ entityType === 'PERSON' ? 'person' : 'organisation' }} profile,
          then run a {{ entityType === 'PERSON' ? 'KYC' : 'KYB' }} verification case. The entity must be APPROVED before a certificate can be issued.
        </p>

        <div *ngIf="error" style="color:#c62828;font-size:13px;margin-bottom:12px">{{ error }}</div>

        <div class="inline-actions" style="margin-top:8px">
          <button mat-raised-button color="primary" [disabled]="loading || !name.trim() || country.trim().length !== 2" (click)="submit()">
            <mat-spinner diameter="16" *ngIf="loading" style="display:inline-block;margin-right:6px"></mat-spinner>
            Register Entity
          </button>
          <button mat-stroked-button routerLink="/entities">Cancel</button>
        </div>
      </mat-card-content></mat-card>
    </div>
  `,
})
export class CreateEntityComponent {
  name = '';
  country = '';
  entityType = 'ORGANISATION';
  loading = false;
  error = '';

  constructor(private api: ApiService, private router: Router, private notify: NotifyService) {}

  submit() {
    this.loading = true;
    this.error = '';
    this.api.createEntity(this.name.trim(), this.country.trim().toUpperCase(), this.entityType).subscribe({
      next: (e) => { this.notify.success('Entity registered'); this.router.navigate(['/entities', e.id]); },
      error: (err: any) => { this.error = this.notify.fromError(err, 'Registration failed.'); this.loading = false; },
    });
  }
}
