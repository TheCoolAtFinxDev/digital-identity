import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgClass, NgFor, NgIf, DatePipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { SEAL_OPTIONS, StaffApi } from '../staff-api.service';
import { ApprovalChainPreview, SealRef, StampRequest } from '../staff.models';
import { StaffBadgeComponent } from '../staff-badge.component';
import { sealLabel } from '../staff.utils';

@Component({
  selector: 'app-stamp-request',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, DatePipe, DecimalPipe, FormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatRadioModule, StaffBadgeComponent,
  ],
  template: `
    <div class="page-container" *ngIf="!loading && req">
      <div class="muted" style="margin-bottom:12px">
        <a routerLink="/staff/documents">Stamps</a> &nbsp;/&nbsp; {{ req.documentName }}
      </div>

      <div class="page-header">
        <div>
          <h1>Request a department stamp</h1>
          <div class="muted" style="margin-top:4px">{{ subtitle() }}</div>
        </div>
        <staff-badge [status]="req.status"></staff-badge>
      </div>

      <div class="stamp-grid">
        <!-- Document + where the seal lands -->
        <div class="panel">
          <div class="inline-actions" style="margin-bottom:16px">
            <mat-icon style="color:#5e35b1">description</mat-icon>
            <span>
              <span style="display:block;font-size:15px;font-weight:500">{{ req.documentName }}</span>
              <span class="muted" style="display:block;font-size:12px">
                {{ req.pageCount }} pages · {{ req.sizeBytes / 1024 | number:'1.0-0' }} KB · uploaded {{ req.uploadedAt | date:'dd MMM, HH:mm' }}
              </span>
            </span>
          </div>

          <div class="section-label">Where the seal lands</div>
          <div class="page-preview">
            <div class="sheet">
              <div class="bar" style="width:58%;height:9px;background:rgba(0,0,0,0.62)"></div>
              <div class="bar" style="width:40%;margin-top:10px;background:rgba(0,0,0,0.2)"></div>
              <div style="margin-top:26px;display:flex;flex-direction:column;gap:7px">
                <div class="bar" style="width:92%"></div><div class="bar" style="width:86%"></div>
                <div class="bar" style="width:90%"></div><div class="bar" style="width:62%"></div>
              </div>
              <div class="seal-box">
                <div class="qr"></div>
                <div style="min-width:0">
                  <div style="font-size:7.5px;font-weight:700;color:#0f3d70">DIGITALLY STAMPED</div>
                  <div style="font-size:7px;color:#0f3d70;margin-top:3px">Econet Telecom Lesotho — {{ req.seal.unitName }}</div>
                  <div style="font-size:6.5px;color:#5a6675;margin-top:3px">{{ sealDate() }}</div>
                  <div style="font-size:6.5px;font-weight:700;color:#0f3d70;margin-top:3px">{{ req.verificationId || 'STM-2026-…' }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="muted" style="margin-top:10px">
            The seal is rendered onto the page first, then signed — so the file you download is exactly what was signed.
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          <!-- Seal choice -->
          <div class="panel">
            <div class="section-label">Seal to apply</div>
            <mat-radio-group [(ngModel)]="selectedSeal" style="display:flex;flex-direction:column;gap:8px">
              <div *ngFor="let s of seals" class="seal-option" [ngClass]="{ 'is-selected': selectedSeal === s.level, 'is-disabled': !s.available }">
                <mat-radio-button [value]="s.level" [disabled]="!s.available">
                  <span style="display:block;font-size:14px;font-weight:500">{{ s.unitName }} — {{ levelLabel(s) }}</span>
                  <span class="muted" style="display:block;font-size:12px">{{ hint(s) }}</span>
                </mat-radio-button>
              </div>
            </mat-radio-group>
          </div>

          <!-- Approval chain -->
          <div class="panel">
            <div class="section-label">Who signs this off</div>
            <div *ngFor="let step of req.chain; let last = last" class="chain-row">
              <div class="chain-rail">
                <span class="chain-dot" [ngClass]="dotClass(step.state)">
                  <mat-icon *ngIf="step.state === 'DONE'">check</mat-icon>
                  <mat-icon *ngIf="step.state === 'FAILED'">close</mat-icon>
                </span>
                <span class="chain-line" *ngIf="!last" [ngClass]="{ 'is-done': step.state === 'DONE' }"></span>
              </div>
              <div style="padding-bottom:18px">
                <div style="font-size:14px;font-weight:500">{{ step.actor?.displayName || 'Department seal' }}</div>
                <div class="muted" style="font-size:12px">{{ step.roleLabel }}</div>
                <div *ngIf="step.note" style="font-size:12px;margin-top:6px"
                     [style.color]="step.state === 'FAILED' ? '#c62828' : 'rgba(0,0,0,0.5)'">{{ step.note }}</div>
              </div>
            </div>

            <div style="height:1px;background:rgba(0,0,0,0.12);margin:4px 0 16px"></div>

            <div class="inline-actions">
              <button mat-raised-button color="primary" *ngIf="canSubmit()" (click)="submit()">Submit request</button>
              <button mat-raised-button color="primary" *ngIf="req.status === 'STAMPED'"
                      (click)="openDocument()">Download stamped PDF</button>
              <button mat-raised-button color="primary" *ngIf="req.status === 'REJECTED'" (click)="revise()">Revise and resubmit</button>
              <button mat-button *ngIf="isWaiting()" disabled>{{ waitingLabel() }}</button>
              <button mat-button color="primary" *ngIf="isWaiting()" (click)="withdraw()">Withdraw request</button>
            </div>
            <div class="muted" style="margin-top:12px">{{ footnote() }}</div>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>
  `,
  styles: [`
    .stamp-grid { display: grid; grid-template-columns: 1fr 420px; gap: 16px; align-items: start; }
    @media (max-width: 900px) { .stamp-grid { grid-template-columns: 1fr; } }
    .panel { background: #fff; border-radius: 4px; padding: 20px;
      box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12); }
    .section-label { font-size: 12px; font-weight: 500; color: rgba(0,0,0,0.54); margin-bottom: 12px; }
    .page-preview { background: #f5f5f5; border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; padding: 24px; display: flex; justify-content: center; }
    .sheet { width: 300px; height: 400px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.16); position: relative; padding: 22px; }
    .bar { height: 5px; background: rgba(0,0,0,0.11); border-radius: 2px; }
    .seal-box { position: absolute; left: 22px; right: 22px; bottom: 22px; height: 74px; border: 1.2px solid #0f3d70;
      background: rgba(255,255,255,0.94); display: flex; align-items: center; gap: 9px; padding: 8px; }
    .qr { width: 54px; height: 54px; flex: none; background:
      repeating-linear-gradient(90deg, #0f3d70 0 4px, #fff 4px 8px),
      repeating-linear-gradient(0deg, #0f3d70 0 4px, transparent 4px 8px); opacity: .85; }
    .seal-option { border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; padding: 12px; }
    .seal-option.is-selected { border-color: #3f51b5; background: #e8eaf6; }
    .seal-option.is-disabled { opacity: .55; }
    .chain-row { display: grid; grid-template-columns: 32px 1fr; gap: 12px; }
    .chain-rail { display: flex; flex-direction: column; align-items: center; }
    .chain-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.08); color: rgba(0,0,0,0.5); flex: none; }
    .chain-dot mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .chain-dot.is-done { background: #2e7d32; color: #fff; }
    .chain-dot.is-current { background: #3f51b5; color: #fff; }
    .chain-dot.is-failed { background: #c62828; color: #fff; }
    .chain-line { width: 2px; flex: 1 1 auto; min-height: 26px; background: rgba(0,0,0,0.12); }
    .chain-line.is-done { background: #2e7d32; }
  `],
})
export class StampRequestComponent implements OnInit {
  req?: StampRequest;
  chainPreview?: ApprovalChainPreview;
  loading = true;
  seals = SEAL_OPTIONS;
  selectedSeal = 'DEPARTMENT';

  constructor(
    private readonly api: StaffApi,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? 'd-lease';
    this.api.stampRequest(id).subscribe((r) => { this.req = r; this.loading = false; });
    this.api.approvalChain().subscribe((c) => (this.chainPreview = c));
  }

  subtitle(): string {
    const unit = this.chainPreview?.unit?.name ?? this.req?.seal.unitName ?? '';
    return `${unit} · Technology Division · Econet Telecom Lesotho`;
  }

  levelLabel(s: SealRef): string {
    return s.level.charAt(0) + s.level.slice(1).toLowerCase();
  }

  hint(s: SealRef): string {
    if (s.level === 'DEPARTMENT') return 'Your department. Manager reviews, HOD approves.';
    if (s.level === 'DIVISION') return 'Needs an EXCO approver. Not available yet.';
    return 'Needs three EXCO signatures. Not available yet.';
  }

  dotClass(state: string) {
    return {
      'is-done': state === 'DONE',
      'is-current': state === 'CURRENT',
      'is-failed': state === 'FAILED',
    };
  }

  sealDate(): string {
    return this.req?.stampedAt ? new Date(this.req.stampedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
      : '— applied on approval —';
  }

  canSubmit(): boolean { return this.req?.status === 'DRAFT'; }
  isWaiting(): boolean {
    return this.req?.status === 'AWAITING_REVIEW' || this.req?.status === 'AWAITING_APPROVAL';
  }
  waitingLabel(): string {
    return this.req?.status === 'AWAITING_REVIEW' ? 'With your manager for review' : 'With your HOD for approval';
  }

  footnote(): string {
    if (this.req?.status === 'REJECTED') return 'Rejections keep the request — revise the document and it goes back for review.';
    if (this.req?.status === 'STAMPED') return 'Anyone can check this document by scanning the QR or uploading the file.';
    return 'Four eyes follows your reporting line: your manager reviews, your head of department approves.';
  }

  submit() {
    if (!this.req) return;
    this.loading = true;
    this.api.submitStampRequest(this.req.id).subscribe((r) => { this.req = r; this.loading = false; });
  }

  withdraw() {
    if (!this.req) return;
    this.loading = true;
    this.api.withdrawStampRequest(this.req.id).subscribe((r) => { this.req = r; this.loading = false; });
  }

  revise() {
    if (!this.req) return;
    this.loading = true;
    this.api.withdrawStampRequest(this.req.id).subscribe((r) => { this.req = r; this.loading = false; });
  }

  openDocument() {
    if (this.req) this.router.navigate(['/staff/documents', this.req.documentId]);
  }
}
