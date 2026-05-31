import { Component, OnDestroy, NgZone, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService, VerificationResponse } from '../../core/api.service';
import { RouterLink } from '@angular/router';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [FormsModule, NgIf, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatCardModule, MatProgressSpinnerModule, MatDividerModule],
  template: `
    <div class="verify-center">
      <h2 style="margin:0;font-size:24px;font-weight:500">Verify Certificate</h2>
      <p style="margin:0;color:rgba(0,0,0,0.6);text-align:center">
        Enter a certificate serial number or scan a QR code from a stamped document.
      </p>

      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Serial Number</mat-label>
        <input matInput [(ngModel)]="serial" (keyup.enter)="verify()" placeholder="e.g. 1001" [disabled]="loading">
      </mat-form-field>

      <div style="display:flex;gap:12px;width:100%">
        <button mat-raised-button color="primary" style="flex:1" [disabled]="!serial.trim() || loading" (click)="verify()">
          <mat-spinner diameter="16" *ngIf="loading" style="display:inline-block;margin-right:6px"></mat-spinner>
          Verify
        </button>
        <button mat-stroked-button (click)="toggleScanner()" [disabled]="loading">
          {{ scanning ? 'Stop Scanner' : 'Scan QR' }}
        </button>
      </div>

      <!-- QR Scanner area -->
      <div class="qr-scanner-area" *ngIf="scanning">
        <div id="qr-reader" style="width:100%"></div>
        <p style="font-size:12px;color:rgba(0,0,0,0.5);text-align:center;margin:4px 0">
          Point camera at the QR code on the stamped document.
        </p>
      </div>

      <!-- Result card -->
      <mat-card class="verify-result" *ngIf="result">
        <mat-card-content>
          <div style="text-align:center;padding:8px 0 16px">
            <div [class]="result.valid ? 'valid-badge' : 'invalid-badge'">
              {{ result.valid ? '✓ VALID' : '✗ INVALID' }}
            </div>
            <div style="font-size:13px;color:rgba(0,0,0,0.6);margin-top:4px">
              Serial {{ result.serial }}
              <span *ngIf="result.isExpired"> · Expired</span>
              <span *ngIf="result.isRevoked"> · Revoked</span>
            </div>
          </div>
          <mat-divider></mat-divider>
          <div class="detail-grid" style="margin-top:12px">
            <span class="label">Subject</span><span class="value">{{ result.subject || '—' }}</span>
            <span class="label">Entity</span><span class="value">{{ result.entity?.name || '—' }}</span>
            <span class="label">Type</span><span class="value">{{ result.identityType || '—' }}</span>
            <span class="label">Issuer</span><span class="value" style="font-size:12px">{{ result.issuer || '—' }}</span>
            <span class="label">Valid From</span><span class="value">{{ result.validFrom || '—' }}</span>
            <span class="label">Valid To</span><span class="value">{{ result.validTo || '—' }}</span>
          </div>
        </mat-card-content>
      </mat-card>

      <div *ngIf="error" style="color:#c62828;font-size:14px">{{ error }}</div>
    </div>
  `
})
export class VerifyComponent implements OnInit, OnDestroy {
  serial = '';
  loading = false;
  scanning = false;
  result: VerificationResponse | null = null;
  error = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private scanner: any = null;

  constructor(private api: ApiService, private zone: NgZone, private route: ActivatedRoute) {}

  ngOnInit() {
    // Auto-verify when arriving from a QR code URL like /verify?s=1001
    const s = this.route.snapshot.queryParamMap.get('s');
    if (s) { this.serial = s; this.verify(); }
  }

  verify() {
    const s = this.serial.trim();
    if (!s) return;
    this.loading = true;
    this.result = null;
    this.error = '';
    this.api.verify(s).subscribe({
      next: (r) => { this.result = r; this.loading = false; },
      error: (err) => {
        this.error = err?.error?.message ?? `No certificate found for serial "${s}".`;
        this.loading = false;
      },
    });
  }

  toggleScanner() {
    if (this.scanning) {
      this.stopScanner();
    } else {
      this.startScanner();
    }
  }

  private startScanner() {
    this.scanning = true;
    // Dynamically load html5-qrcode after the div is rendered
    setTimeout(() => {
      import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
        this.scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        this.scanner.render(
          (text: string) => {
            this.zone.run(() => {
              this.stopScanner();
              // Handle both raw serial and full URL (e.g. http://host/verify?s=1001)
              try {
                const url = new URL(text);
                this.serial = url.searchParams.get('s') ?? text;
              } catch {
                this.serial = text;
              }
              this.verify();
            });
          },
          () => { /* scan errors are normal - ignore */ },
        );
      });
    }, 100);
  }

  private stopScanner() {
    if (this.scanner) {
      this.scanner.clear().catch(() => {});
      this.scanner = null;
    }
    this.scanning = false;
  }

  ngOnDestroy() { this.stopScanner(); }
}
