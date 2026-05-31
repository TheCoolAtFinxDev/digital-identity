import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIf, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService, CertRequestDetail } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-request-detail',
  standalone: true,
  imports: [NgIf, DatePipe, RouterLink, MatButtonModule, MatCardModule, MatProgressSpinnerModule, MatDividerModule, StatusBadgeComponent],
  template: `
    <div class="page-container">
      <div style="margin-bottom:16px"><a mat-button routerLink="/requests" style="padding-left:0">&larr; Back to Requests</a></div>

      <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <ng-container *ngIf="!loading && req">
        <div class="page-header">
          <h1>Certificate Request</h1>
          <status-badge [status]="req.status"></status-badge>
        </div>

        <mat-card style="margin-bottom:20px"><mat-card-content>
          <div class="detail-grid">
            <span class="label">Request ID</span><span class="value" style="font-size:12px;font-family:monospace">{{ req.id }}</span>
            <span class="label">Profile</span><span class="value">{{ req.profile }}</span>
            <span class="label">Subject</span><span class="value">{{ req.subject || '—' }}</span>
            <span class="label">Key Bits</span><span class="value">{{ req.keyBits || '—' }}</span>
            <span class="label">Entity</span><span class="value">
              <a *ngIf="req.entityId" [routerLink]="['/entities', req.entityId]">{{ req.entityId }}</a>
              <span *ngIf="!req.entityId">—</span>
            </span>
            <span class="label">Created</span><span class="value">{{ req.createdAt | date:'dd MMM yyyy HH:mm:ss' }}</span>
          </div>
        </mat-card-content></mat-card>

        <div *ngIf="req.status === 'NEW' && auth.has('cert:issue')" style="margin-bottom:20px">
          <button mat-raised-button color="accent" [disabled]="issuing" (click)="issue()">
            <mat-spinner diameter="16" *ngIf="issuing" style="display:inline-block;margin-right:6px"></mat-spinner>
            Issue Certificate
          </button>
          <span class="muted" style="margin-left:12px">Entity must be APPROVED before issuance succeeds.</span>
        </div>

        <mat-card *ngIf="req.status === 'ISSUED' && req.certificate">
          <mat-card-header><mat-card-title>Issued Certificate</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="detail-grid" style="margin-top:12px">
              <span class="label">Serial</span><span class="value">{{ req.certificate.serial }}</span>
              <span class="label">Key custody</span><span class="value">
                <span class="badge" [class]="req.certificate.hsmManaged ? 'badge b-neutral' : 'badge b-approved'">
                  {{ req.certificate.hsmManaged ? 'HSM (managed/escrow)' : 'External (entity-held)' }}
                </span>
              </span>
              <span class="label">Revoked</span><span class="value">
                <status-badge [status]="req.certificate.isRevoked ? 'REJECTED' : 'ACTIVE'"></status-badge>
              </span>
              <span class="label">Valid From</span><span class="value">{{ req.certificate.validFrom | date:'dd MMM yyyy' }}</span>
              <span class="label">Valid To</span><span class="value">{{ req.certificate.validTo | date:'dd MMM yyyy' }}</span>
              <span class="label">Fingerprint</span><span class="value" style="font-size:11px;font-family:monospace">{{ req.certificate.fingerprint || '—' }}</span>
            </div>
            <mat-divider style="margin:16px 0"></mat-divider>
            <div class="inline-actions" style="margin-bottom:8px">
              <button mat-stroked-button (click)="download()">Download PEM</button>
              <button mat-stroked-button (click)="copyPem()">Copy PEM</button>
              <button *ngIf="!req.certificate.isRevoked && auth.has('cert:revoke')" mat-stroked-button color="warn" (click)="revoke()">Revoke</button>
            </div>
            <div class="pem-box">{{ req.certificate.certPem }}</div>
          </mat-card-content>
        </mat-card>
      </ng-container>
    </div>
  `,
})
export class RequestDetailComponent implements OnInit {
  req: CertRequestDetail | null = null;
  loading = false;
  issuing = false;

  constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService, private notify: NotifyService) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading = true;
    this.api.getRequest(id).subscribe({
      next: (r) => { this.req = r; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  issue() {
    if (!this.req) return;
    this.issuing = true;
    this.api.issueRequest(this.req.id).subscribe({
      next: () => {
        this.notify.success('Certificate issued');
        this.api.getRequest(this.req!.id).subscribe((r) => { this.req = r; this.issuing = false; });
      },
      error: (err: any) => { this.notify.error(this.notify.fromError(err, 'Issuance failed')); this.issuing = false; },
    });
  }

  revoke() {
    const serial = this.req?.certificate?.serial;
    if (!serial) return;
    this.api.revokeCertificate(serial).subscribe({
      next: () => { this.notify.success('Certificate revoked'); this.api.getRequest(this.req!.id).subscribe((r) => this.req = r); },
      error: (err: any) => this.notify.error(this.notify.fromError(err, 'Revocation failed')),
    });
  }

  download() {
    if (!this.req?.certificate) return;
    const blob = new Blob([this.req.certificate.certPem], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cert-${this.req.certificate.serial}.pem`; a.click();
    URL.revokeObjectURL(url);
  }

  copyPem() {
    if (!this.req?.certificate) return;
    navigator.clipboard.writeText(this.req.certificate.certPem).then(() => this.notify.success('PEM copied'));
  }
}
