import { Component, OnInit } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StaffApi } from '../staff-api.service';
import { DecisionResult, WorkItem } from '../staff.models';
import { isStale, sealLabel, waitingAge } from '../staff.utils';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, FormsModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Awaiting me</h1>
          <div class="muted" style="margin-top:4px">Stamp requests to review or approve, and documents to sign</div>
        </div>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <div *ngIf="!loading && !queue.length" class="muted" style="text-align:center;padding:56px">
        <div style="font-size:15px">Nothing is waiting on you.</div>
        <div style="font-size:13px;margin-top:6px">Requests from your reports appear here as they are raised.</div>
      </div>

      <div class="queue-grid" *ngIf="!loading && queue.length">
        <div class="panel" style="padding:0;overflow:hidden">
          <div *ngFor="let item of queue; let i = index"
               class="queue-item" [ngClass]="{ 'is-selected': selected === i }" (click)="pick(i)">
            <mat-icon [style.color]="item.seal ? '#5e35b1' : '#3f51b5'">{{ item.seal ? 'approval' : 'draw' }}</mat-icon>
            <span style="flex:1 1 auto;min-width:0">
              <span style="display:block;font-weight:500">{{ item.name }}</span>
              <span class="muted" style="display:block;font-size:12px;margin-top:3px">
                {{ item.requester.displayName }} · {{ item.requester.unitName }}
              </span>
              <span class="badge" style="margin-top:8px;display:inline-block"
                    [ngClass]="item.action === 'SIGN' ? 'b-pending' : 'b-review'">{{ actionLabel(item.action) }}</span>
            </span>
            <span style="font-size:12px;white-space:nowrap"
                  [style.color]="stale(item.waitingSince) ? '#f57f17' : 'rgba(0,0,0,0.45)'">{{ age(item.waitingSince) }}</span>
          </div>
        </div>

        <div class="panel" *ngIf="current">
          <div class="page-header" style="margin-bottom:16px">
            <div>
              <div style="font-size:17px;font-weight:500">{{ current.name }}</div>
              <div class="muted" style="margin-top:4px">{{ current.meta }}</div>
            </div>
            <span class="badge" [ngClass]="current.action === 'SIGN' ? 'b-pending' : 'b-review'">{{ actionLabel(current.action) }}</span>
          </div>

          <div class="detail-grid">
            <div class="label">Requested by</div>
            <div class="value">{{ current.requester.displayName }} — {{ current.requester.unitName }}</div>
            <div class="label">Seal requested</div>
            <div class="value">{{ current.seal ? seal(current.seal) : '—' }}</div>
            <div class="label">Waiting</div>
            <div class="value">{{ age(current.waitingSince) }}</div>
          </div>

          <div *ngIf="outcome" class="outcome" [ngClass]="outcome.status === 'REJECTED' ? 'is-bad' : 'is-good'">
            {{ outcome.message }}
          </div>

          <div *ngIf="!outcome">
            <mat-form-field appearance="outline" style="width:100%">
              <mat-label>Note to the requester</mat-label>
              <textarea matInput rows="3" [(ngModel)]="note" placeholder="Optional — the requester sees this"></textarea>
            </mat-form-field>

            <div class="inline-actions">
              <button mat-raised-button color="primary" [disabled]="deciding" (click)="decide('APPROVE')">{{ approveLabel() }}</button>
              <button mat-button style="color:#c62828" [disabled]="deciding" (click)="decide('REJECT')">Reject</button>
              <span class="spacer"></span>
              <button mat-button color="primary">Open document</button>
            </div>
            <div class="muted" style="margin-top:14px">{{ footnote() }}</div>
          </div>

          <button mat-button color="primary" *ngIf="outcome" (click)="clear()">Back to the queue</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .queue-grid { display: grid; grid-template-columns: 420px 1fr; gap: 16px; align-items: start; }
    @media (max-width: 900px) { .queue-grid { grid-template-columns: 1fr; } }
    .panel { background: #fff; border-radius: 4px; padding: 20px;
      box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12); }
    .queue-item { display: flex; gap: 12px; padding: 14px 16px; cursor: pointer;
      border-bottom: 1px solid rgba(0,0,0,0.12); border-left: 3px solid transparent; }
    .queue-item:hover { background: #f5f5f5; }
    .queue-item.is-selected { background: #e8eaf6; border-left-color: #3f51b5; }
    .outcome { padding: 16px; border-radius: 4px; font-size: 14px; margin-bottom: 16px; }
    .outcome.is-good { background: #e8f5e9; color: #2e7d32; }
    .outcome.is-bad { background: #fce4ec; color: #c62828; }
  `],
})
export class ApprovalQueueComponent implements OnInit {
  queue: WorkItem[] = [];
  selected = 0;
  loading = true;
  deciding = false;
  note = '';
  outcome?: DecisionResult;

  constructor(private readonly api: StaffApi) {}

  ngOnInit() {
    this.api.awaitingMe().subscribe((items) => {
      this.queue = items;
      this.loading = false;
    });
  }

  get current(): WorkItem | undefined {
    return this.queue[this.selected];
  }

  pick(i: number) {
    this.selected = i;
    this.outcome = undefined;
    this.note = '';
  }

  clear() {
    this.outcome = undefined;
    this.note = '';
  }

  seal = sealLabel;
  age = waitingAge;
  stale = isStale;

  actionLabel(action: string): string {
    return action === 'SIGN' ? 'Sign' : action === 'REVIEW' ? 'Review' : 'Approve';
  }

  approveLabel(): string {
    if (this.current?.action === 'SIGN') return 'Sign document';
    return this.current?.action === 'APPROVE' ? 'Approve and stamp' : 'Approve review';
  }

  footnote(): string {
    if (this.current?.action === 'SIGN') {
      return 'Signing uses your own key, so the signature is attributable to you personally.';
    }
    if (this.current?.action === 'APPROVE') {
      return 'Approving releases the department key. You cannot approve a request you raised yourself.';
    }
    return 'Your review does not stamp the document — it passes it to the head of department.';
  }

  decide(decision: 'APPROVE' | 'REJECT') {
    const item = this.current;
    if (!item) return;
    this.deciding = true;
    this.api.decide(item.documentId, decision, this.note).subscribe({
      next: (result) => {
        this.outcome = result;
        this.deciding = false;
      },
      error: () => {
        this.outcome = { status: 'AWAITING_REVIEW', message: 'That did not go through. Try again.' };
        this.deciding = false;
      },
    });
  }
}
