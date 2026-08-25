import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgClass, NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StaffApi } from '../staff-api.service';
import { DocumentDetail, TrailEntry } from '../staff.models';
import { StaffBadgeComponent } from '../staff-badge.component';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, DatePipe, FormsModule, RouterLink, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, StaffBadgeComponent,
  ],
  template: `
    <div class="page-container" *ngIf="!loading && doc">
      <div class="muted" style="margin-bottom:12px">
        <a routerLink="/staff/documents">My documents</a> &nbsp;/&nbsp; {{ doc.name }}
      </div>

      <div class="page-header">
        <div>
          <h1>{{ doc.name }}</h1>
          <div class="muted" style="margin-top:4px">
            <span *ngIf="doc.stampedAt">Stamped {{ doc.stampedAt | date:'dd MMM, HH:mm' }} · </span>
            {{ doc.pageCount }} pages
          </div>
        </div>
        <staff-badge [status]="doc.standing"></staff-badge>
      </div>

      <!-- Recall confirmation -->
      <div class="panel recall-panel" *ngIf="confirming">
        <div style="font-size:16px;font-weight:500;margin-bottom:8px">Recall this document?</div>
        <div style="font-size:14px;color:rgba(0,0,0,0.6);max-width:70ch">
          Anyone who verifies it from now on — by scanning the QR or uploading the file — will be told it was
          withdrawn. Copies already printed or emailed cannot be taken back, which is the point of recording the recall.
        </div>
        <mat-form-field appearance="outline" style="width:100%;max-width:640px;margin-top:16px">
          <mat-label>Reason, shown to anyone who verifies it</mat-label>
          <textarea matInput rows="2" [(ngModel)]="reason" placeholder="Wrong VAT rate applied"></textarea>
        </mat-form-field>
        <div class="inline-actions">
          <button mat-raised-button style="background:#c62828;color:#fff" [disabled]="!reason.trim() || working"
                  (click)="confirmRecall()">Recall document</button>
          <button mat-button color="primary" (click)="confirming = false">Keep it valid</button>
        </div>
      </div>

      <div class="detail-columns">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="panel">
            <div class="section-label">Who put their name to this</div>
            <div *ngFor="let t of doc.trail" class="trail-row">
              <span class="avatar" [ngClass]="avatarClass(t)">{{ initials(t) }}</span>
              <span style="flex:1 1 auto;min-width:0">
                <span style="display:block;font-size:14px;font-weight:500">{{ t.actor.displayName }}</span>
                <span class="muted" style="display:block;font-size:12px;margin-top:2px">{{ t.what }}</span>
              </span>
              <span class="muted" style="font-size:12px;white-space:nowrap">{{ t.at | date:'HH:mm' }}</span>
            </div>
          </div>

          <div class="panel" *ngIf="doc.certificate">
            <div class="section-label">Cryptographic detail</div>
            <div class="detail-grid">
              <div class="label">Signing certificate</div>
              <div class="value">Serial {{ doc.certificate.serial }} · {{ doc.certificate.holder }}</div>
              <div class="label">Certificate status</div>
              <div class="value" [style.color]="doc.certificate.isRevoked ? '#c62828' : '#2e7d32'">
                {{ doc.certificate.isRevoked ? 'Revoked' : 'Valid until ' + (doc.certificate.validTo | date:'dd MMM yyyy') }}
              </div>
              <div class="label">Content hash</div>
              <div class="value" style="font-family:monospace;font-size:12px">{{ doc.contentHash }}</div>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="panel" style="text-align:center">
            <div class="section-label" style="text-align:left">Verification</div>
            <div class="qr" [style.opacity]="doc.standing === 'RECALLED' ? 0.35 : 1"></div>
            <div style="font-family:monospace;font-size:13px;font-weight:500;margin-top:10px">{{ doc.verificationId }}</div>
            <div class="muted" style="margin-top:6px">
              {{ doc.standing === 'RECALLED' ? 'Scanning this now reports the document as recalled' : 'Scan or enter this ID to check the document' }}
            </div>
          </div>

          <div class="panel">
            <div style="display:flex;flex-direction:column;gap:8px">
              <button mat-raised-button color="primary" [disabled]="downloading" (click)="download()">
                {{ downloading ? 'Preparing download…' : 'Download stamped PDF' }}
              </button>
              <div *ngIf="downloadError" style="color:#c62828;font-size:12px">{{ downloadError }}</div>
              <button mat-stroked-button>Check this document</button>
              <ng-container *ngIf="doc.canRecall || doc.canReplace">
                <div style="height:1px;background:rgba(0,0,0,0.12);margin:6px 0"></div>
                <button mat-button *ngIf="doc.canReplace">Replace with a corrected version</button>
                <button mat-button style="color:#c62828" *ngIf="doc.canRecall" (click)="startRecall()">Recall this document</button>
              </ng-container>
            </div>
            <div class="muted" style="margin-top:14px">{{ actionsFootnote() }}</div>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>
  `,
  styles: [`
    .detail-columns { display: grid; grid-template-columns: 1fr 400px; gap: 16px; align-items: start; }
    @media (max-width: 900px) { .detail-columns { grid-template-columns: 1fr; } }
    .panel { background: #fff; border-radius: 4px; padding: 20px;
      box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12); }
    .recall-panel { border-left: 3px solid #c62828; margin-bottom: 16px; }
    .section-label { font-size: 12px; font-weight: 500; color: rgba(0,0,0,0.54); margin-bottom: 14px; }
    .trail-row { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .trail-row:last-child { border-bottom: 0; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600; flex: none; background: #e8eaf6; color: #3f51b5; }
    .avatar.is-review { background: #fff8e1; color: #f57f17; }
    .avatar.is-approve { background: #e8f5e9; color: #2e7d32; }
    .avatar.is-recall { background: #fce4ec; color: #c62828; }
    .qr { width: 132px; height: 132px; margin: 0 auto; background:
      repeating-linear-gradient(90deg, #0f3d70 0 8px, #fff 8px 16px),
      repeating-linear-gradient(0deg, #0f3d70 0 8px, transparent 8px 16px); }
  `],
})
export class DocumentDetailComponent implements OnInit {
  doc?: DocumentDetail;
  loading = true;
  confirming = false;
  working = false;
  downloading = false;
  downloadError = '';
  reason = '';

  constructor(private readonly api: StaffApi, private readonly route: ActivatedRoute) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'd-4182';
    this.api.document(id).subscribe((d) => { this.doc = d; this.loading = false; });
  }

  initials(t: TrailEntry): string {
    return t.actor.displayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  avatarClass(t: TrailEntry) {
    return {
      'is-review': t.outcome === 'REVIEWED',
      'is-approve': t.outcome === 'APPROVED' || t.outcome === 'STAMPED',
      'is-recall': t.outcome === 'RECALLED' || t.outcome === 'REJECTED',
    };
  }

  actionsFootnote(): string {
    return this.doc?.standing === 'RECALLED'
      ? 'A recall cannot be undone. Issue a corrected document instead — it will carry its own verification ID.'
      : 'Recalling withdraws this document only. It does not revoke the department key or affect anything else it has stamped.';
  }

  startRecall() {
    this.confirming = true;
    this.reason = '';
  }

  download() {
    if (!this.doc || this.downloading) return;
    this.downloading = true;
    this.downloadError = '';
    this.api.download(this.doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.doc?.name ?? 'stamped-document.pdf';
        link.click();
        URL.revokeObjectURL(url);
        this.downloading = false;
      },
      error: () => {
        this.downloadError = 'No stamped PDF is available. Run the feature demo data script first.';
        this.downloading = false;
      },
    });
  }

  confirmRecall() {
    if (!this.doc) return;
    this.working = true;
    this.api.recall(this.doc.id, this.reason).subscribe((d) => {
      this.doc = d;
      this.confirming = false;
      this.working = false;
    });
  }
}
