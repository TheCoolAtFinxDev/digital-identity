import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, VerificationCase, Evidence } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-case-detail',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, DecimalPipe, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTableModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container" *ngIf="!loading && vc">
      <div class="page-header">
        <h1>{{ vc.caseType }} Case <status-badge [status]="vc.status"></status-badge></h1>
        <a mat-button routerLink="/verification-cases">← Back</a>
      </div>

      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <div class="detail-grid">
          <div class="label">Entity</div><div class="value"><a [routerLink]="['/entities', vc.entityId]">{{ vc.entity?.name || vc.entityId }}</a></div>
          <div class="label">Priority</div><div class="value">{{ vc.priority }}</div>
          <div class="label">Created by</div><div class="value">{{ vc.createdBy?.username || vc.createdById }}</div>
          <div class="label">Reviewer</div><div class="value">{{ vc.reviewedBy?.username || '—' }}</div>
          <div class="label">Approver</div><div class="value">{{ vc.approvedBy?.username || '—' }}</div>
          <div class="label" *ngIf="vc.reviewNotes">Review notes</div><div class="value" *ngIf="vc.reviewNotes">{{ vc.reviewNotes }}</div>
          <div class="label" *ngIf="vc.rejectionReason">Rejection reason</div><div class="value" *ngIf="vc.rejectionReason">{{ vc.rejectionReason }}</div>
        </div>

        <!-- Workflow actions -->
        <div class="inline-actions" style="margin-top:8px">
          <button *ngIf="vc.status === 'DRAFT' && auth.has('entity:onboard')" mat-raised-button color="primary" (click)="submitCase()">Submit for Review</button>
          <button *ngIf="vc.status === 'SUBMITTED' && auth.has('entity:review')" mat-raised-button color="primary" (click)="assignSelf()">Assign to Me</button>
          <button *ngIf="vc.status === 'UNDER_REVIEW' && auth.has('entity:review')" mat-raised-button color="primary" (click)="showReview = !showReview">Complete Review</button>
          <button *ngIf="vc.status === 'PENDING_APPROVAL' && auth.has('entity:approve')" mat-raised-button color="primary" (click)="approve()">Approve</button>
          <button *ngIf="(vc.status === 'UNDER_REVIEW' || vc.status === 'PENDING_APPROVAL') && auth.has('entity:reject')" mat-stroked-button color="warn" (click)="showReject = !showReject">Reject</button>
          <button *ngIf="(vc.status === 'DRAFT' || vc.status === 'SUBMITTED') && auth.has('entity:onboard')" mat-stroked-button (click)="withdraw()">Withdraw</button>
        </div>

        <div *ngIf="showReview" class="inline-actions" style="margin-top:12px">
          <mat-form-field appearance="outline" style="flex:1;min-width:320px">
            <mat-label>Review notes (required)</mat-label>
            <textarea matInput rows="2" [(ngModel)]="reviewNotes"></textarea>
          </mat-form-field>
          <button mat-raised-button color="primary" [disabled]="reviewNotes.trim().length < 10" (click)="review()">Submit Review</button>
        </div>
        <div *ngIf="showReject" class="inline-actions" style="margin-top:12px">
          <mat-form-field appearance="outline" style="flex:1;min-width:320px">
            <mat-label>Rejection reason (required)</mat-label>
            <textarea matInput rows="2" [(ngModel)]="rejectionReason"></textarea>
          </mat-form-field>
          <button mat-raised-button color="warn" [disabled]="rejectionReason.trim().length < 10" (click)="reject()">Confirm Reject</button>
        </div>
      </mat-card-content></mat-card>

      <!-- Evidence -->
      <mat-card><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Evidence ({{ evidence.length }})</h3>

        <div *ngIf="vc.status === 'DRAFT' && auth.has('entity:onboard')" class="inline-actions" style="margin-bottom:16px">
          <input type="file" #fileInput (change)="onFile($event)" style="display:none">
          <button mat-stroked-button (click)="fileInput.click()">{{ selectedFile?.name || 'Choose file…' }}</button>
          <mat-form-field appearance="outline" style="width:220px">
            <mat-label>Document type</mat-label>
            <mat-select [(ngModel)]="docType">
              <mat-option *ngFor="let d of docTypes" [value]="d">{{ d }}</mat-option>
            </mat-select>
          </mat-form-field>
          <button mat-raised-button color="primary" [disabled]="!selectedFile || !docType || uploading" (click)="upload()">Upload</button>
        </div>

        <mat-table [dataSource]="evidence" *ngIf="evidence.length">
          <ng-container matColumnDef="fileName"><mat-header-cell *matHeaderCellDef>File</mat-header-cell>
            <mat-cell *matCellDef="let e" style="font-weight:500">{{ e.fileName }}</mat-cell></ng-container>
          <ng-container matColumnDef="documentType"><mat-header-cell *matHeaderCellDef>Type</mat-header-cell>
            <mat-cell *matCellDef="let e">{{ e.documentType }}</mat-cell></ng-container>
          <ng-container matColumnDef="size"><mat-header-cell *matHeaderCellDef>Size</mat-header-cell>
            <mat-cell *matCellDef="let e">{{ (e.fileSize / 1024) | number:'1.0-1' }} KB</mat-cell></ng-container>
          <ng-container matColumnDef="sha256"><mat-header-cell *matHeaderCellDef>SHA-256</mat-header-cell>
            <mat-cell *matCellDef="let e" style="font-family:monospace;font-size:11px">{{ e.sha256Hash.slice(0,16) }}…</mat-cell></ng-container>
          <ng-container matColumnDef="actions"><mat-header-cell *matHeaderCellDef></mat-header-cell>
            <mat-cell *matCellDef="let e">
              <button mat-button (click)="download(e)">Download</button>
              <button *ngIf="vc?.status === 'DRAFT' && auth.has('entity:onboard')" mat-button color="warn" (click)="deleteEvidence(e)">Delete</button>
            </mat-cell></ng-container>
          <mat-header-row *matHeaderRowDef="ecols"></mat-header-row>
          <mat-row *matRowDef="let e; columns: ecols"></mat-row>
        </mat-table>
        <div *ngIf="!evidence.length" class="muted">No evidence uploaded.</div>
      </mat-card-content></mat-card>
    </div>

    <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>
  `,
})
export class CaseDetailComponent implements OnInit {
  id!: string;
  vc: VerificationCase | null = null;
  evidence: Evidence[] = [];
  ecols = ['fileName', 'documentType', 'size', 'sha256', 'actions'];
  loading = true;

  showReview = false; reviewNotes = '';
  showReject = false; rejectionReason = '';
  selectedFile: File | null = null; docType = ''; uploading = false;
  docTypes = ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENCE', 'COMPANY_CERTIFICATE', 'MEMORANDUM_OF_INCORPORATION',
    'TAX_CERTIFICATE', 'VAT_CERTIFICATE', 'UTILITY_BILL', 'BANK_STATEMENT', 'PROOF_OF_ADDRESS',
    'SHAREHOLDING_REGISTER', 'RESOLUTION_OF_DIRECTORS', 'OTHER'];

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router, public auth: AuthService, private notify: NotifyService) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.reload();
  }

  reload() {
    this.api.getCase(this.id).subscribe({
      next: (c) => { this.vc = c; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.api.listEvidence(this.id).subscribe({ next: (e) => this.evidence = e, error: () => {} });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  upload() {
    if (!this.selectedFile || !this.docType) return;
    this.uploading = true;
    this.api.uploadEvidence(this.id, this.selectedFile, this.docType).subscribe({
      next: () => { this.notify.success('Evidence uploaded'); this.selectedFile = null; this.docType = ''; this.uploading = false; this.reload(); },
      error: (e: any) => { this.notify.error(this.notify.fromError(e, 'Upload failed')); this.uploading = false; },
    });
  }

  download(e: Evidence) {
    this.api.downloadEvidence(this.id, e.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = e.fileName; a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: any) => this.notify.error(this.notify.fromError(err, 'Download failed')),
    });
  }

  deleteEvidence(e: Evidence) {
    this.api.deleteEvidence(this.id, e.id).subscribe({
      next: () => { this.notify.success('Evidence deleted'); this.reload(); },
      error: (err: any) => this.notify.error(this.notify.fromError(err, 'Delete failed')),
    });
  }

  submitCase() { this.act(this.api.submitCase(this.id), 'Case submitted'); }
  assignSelf() { this.act(this.api.assignCase(this.id), 'Assigned to you'); }
  review() { this.act(this.api.reviewCase(this.id, this.reviewNotes), 'Review submitted', () => { this.showReview = false; this.reviewNotes = ''; }); }
  approve() { this.act(this.api.approveCase(this.id), 'Case approved'); }
  reject() { this.act(this.api.rejectCase(this.id, this.rejectionReason), 'Case rejected', () => { this.showReject = false; this.rejectionReason = ''; }); }
  withdraw() { this.act(this.api.withdrawCase(this.id), 'Case withdrawn'); }

  private act(obs: any, okMsg: string, after?: () => void) {
    obs.subscribe({
      next: () => { this.notify.success(okMsg); after?.(); this.reload(); },
      error: (e: any) => this.notify.error(this.notify.fromError(e, 'Action failed')),
    });
  }
}
