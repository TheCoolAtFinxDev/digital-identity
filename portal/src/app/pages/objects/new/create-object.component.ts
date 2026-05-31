import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf, NgFor } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/api.service';

const OBJECT_TYPES = ['DOCUMENT', 'TICKET', 'LICENSE', 'APPLICATION', 'CREDENTIAL', 'DIGITAL_ASSET'];

@Component({
  selector: 'app-create-object',
  standalone: true,
  imports: [FormsModule, NgIf, NgFor, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container" style="max-width:640px">
      <div style="margin-bottom:16px">
        <a mat-button routerLink="/objects" style="padding-left:0">&larr; Back to Objects</a>
      </div>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:500">Register Digital Object</h1>

      <mat-card>
        <mat-card-content style="padding-top:16px">
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Object Type</mat-label>
            <mat-select [(ngModel)]="objectType">
              <mat-option *ngFor="let t of types" [value]="t">{{ t }}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" style="width:100%;margin-top:12px">
            <mat-label>Reference</mat-label>
            <input matInput [(ngModel)]="reference" placeholder="DOC-2024-001, INV-2024-5000, etc.">
            <mat-hint>Unique reference identifier for this object</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" style="width:100%;margin-top:12px">
            <mat-label>Entity ID (optional)</mat-label>
            <input matInput [(ngModel)]="entityId" placeholder="UUID of linked entity">
            <mat-hint>Link this object to a registered legal entity</mat-hint>
          </mat-form-field>

          <div *ngIf="error" style="color:#c62828;font-size:13px;margin-top:12px">{{ error }}</div>

          <div style="display:flex;gap:12px;margin-top:20px">
            <button mat-raised-button color="primary" [disabled]="loading || !objectType || !reference.trim()" (click)="submit()">
              <mat-spinner diameter="16" *ngIf="loading" style="display:inline-block;margin-right:6px"></mat-spinner>
              Register Object
            </button>
            <button mat-stroked-button routerLink="/objects">Cancel</button>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class CreateObjectComponent implements OnInit {
  objectType = 'DOCUMENT';
  reference = '';
  entityId = '';
  loading = false;
  error = '';
  types = OBJECT_TYPES;

  constructor(private route: ActivatedRoute, private api: ApiService, private router: Router) {}

  ngOnInit() {
    // Pre-fill entityId from query param (set when navigating from entity detail)
    const id = this.route.snapshot.queryParamMap.get('entityId');
    if (id) this.entityId = id;
  }

  submit() {
    this.loading = true;
    this.error = '';
    this.api.createObject(this.objectType, this.reference.trim(), this.entityId.trim() || undefined).subscribe({
      next: (o) => this.router.navigate(['/objects', o.id]),
      error: (err) => { this.error = err?.error?.message ?? 'Registration failed.'; this.loading = false; },
    });
  }
}
