import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-submit-csr',
  standalone: true,
  imports: [FormsModule, NgIf, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCardModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container" style="max-width:720px">
      <div style="margin-bottom:16px">
        <a mat-button routerLink="/requests" style="padding-left:0">&larr; Back to Requests</a>
      </div>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:500">Submit Certificate Request</h1>

      <mat-card>
        <mat-card-content style="padding-top:16px">
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Profile</mat-label>
            <mat-select [(ngModel)]="profile" name="profile">
              <mat-option value="usr_entity_cert">Entity Identity (usr_entity_cert)</mat-option>
              <mat-option value="usr_cert">Object / Generic (usr_cert)</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" style="width:100%;margin-top:4px" *ngIf="profile === 'usr_entity_cert'">
            <mat-label>Entity ID</mat-label>
            <input matInput [(ngModel)]="entityId" name="entityId" placeholder="UUID of the registered entity">
            <mat-hint>Required for entity identity certificates. Entity must have APPROVED KYC.</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" style="width:100%;margin-top:12px">
            <mat-label>CSR (PEM format)</mat-label>
            <textarea matInput [(ngModel)]="csrPem" name="csrPem" rows="14"
              placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
              style="font-family:monospace;font-size:12px"></textarea>
            <mat-hint>Paste the output of: openssl req -new -key mykey.pem -out mycsr.pem</mat-hint>
          </mat-form-field>

          <div *ngIf="error" style="color:#c62828;font-size:13px;margin:12px 0">{{ error }}</div>

          <div style="display:flex;gap:12px;margin-top:20px">
            <button mat-raised-button color="primary" [disabled]="loading || !csrPem.trim()" (click)="submit()">
              <mat-spinner diameter="16" *ngIf="loading" style="display:inline-block;margin-right:6px"></mat-spinner>
              Submit Request
            </button>
            <button mat-stroked-button routerLink="/requests">Cancel</button>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class SubmitCsrComponent implements OnInit {
  profile = 'usr_entity_cert';
  entityId = '';
  csrPem = '';
  loading = false;
  error = '';

  constructor(private route: ActivatedRoute, private api: ApiService, private router: Router) {}

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('entityId');
    if (id) this.entityId = id;
  }

  submit() {
    if (!this.csrPem.trim()) return;
    this.loading = true;
    this.error = '';
    this.api.submitCsr(this.csrPem.trim(), this.profile, this.entityId.trim() || undefined).subscribe({
      next: (req) => this.router.navigate(['/requests', req.id]),
      error: (err) => {
        this.error = err?.error?.message ?? 'Submission failed.';
        this.loading = false;
      },
    });
  }
}
