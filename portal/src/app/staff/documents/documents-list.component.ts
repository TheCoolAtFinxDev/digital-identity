import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StaffApi } from '../staff-api.service';
import { DocumentSummary, WorkItem } from '../staff.models';
import { StaffBadgeComponent } from '../staff-badge.component';
import { sealLabel, waitingAge } from '../staff.utils';

type Tab = { label: string; load: () => void };

@Component({
  selector: 'app-staff-documents',
  standalone: true,
  imports: [
    NgFor, NgIf, DatePipe, MatTableModule, MatButtonModule, MatMenuModule,
    MatIconModule, MatTabsModule, MatProgressSpinnerModule, StaffBadgeComponent,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>My documents</h1>
          <div class="muted" style="margin-top:4px">{{ unitLine }}</div>
        </div>
        <button mat-raised-button color="primary" [matMenuTriggerFor]="createMenu">
          New document
          <mat-icon iconPositionEnd>expand_more</mat-icon>
        </button>
        <mat-menu #createMenu="matMenu">
          <button mat-menu-item (click)="notImplemented('Sign a document')">
            <mat-icon>draw</mat-icon>
            <span>Sign a document</span>
          </button>
          <button mat-menu-item (click)="notImplemented('Request signatures')">
            <mat-icon>send</mat-icon>
            <span>Request signatures</span>
          </button>
          <button mat-menu-item (click)="newStampRequest()">
            <mat-icon>approval</mat-icon>
            <span>Request a department stamp</span>
          </button>
        </mat-menu>
      </div>

      <mat-tab-group [selectedIndex]="tabIndex" (selectedIndexChange)="selectTab($event)" animationDuration="0ms">
        <mat-tab>
          <ng-template mat-tab-label>
            Awaiting me
            <span class="tab-count" *ngIf="awaiting.length">{{ awaiting.length }}</span>
          </ng-template>
        </mat-tab>
        <mat-tab label="My documents"></mat-tab>
        <mat-tab label="Sent for signature"></mat-tab>
        <mat-tab label="Stamp requests"></mat-tab>
      </mat-tab-group>

      <div class="inline-actions" style="margin:16px 0 12px">
        <button mat-stroked-button [matMenuTriggerFor]="anyoneMenu" class="filter-chip">Anyone <mat-icon>expand_more</mat-icon></button>
        <mat-menu #anyoneMenu="matMenu"><button mat-menu-item>Anyone</button><button mat-menu-item>Raised by me</button></mat-menu>

        <button mat-stroked-button [matMenuTriggerFor]="sealMenu" class="filter-chip">Seal <mat-icon>expand_more</mat-icon></button>
        <mat-menu #sealMenu="matMenu"><button mat-menu-item>Any seal</button><button mat-menu-item>Finance — Department</button></mat-menu>

        <button mat-stroked-button [matMenuTriggerFor]="statusMenu" class="filter-chip">Status <mat-icon>expand_more</mat-icon></button>
        <mat-menu #statusMenu="matMenu"><button mat-menu-item>Any status</button><button mat-menu-item>Needs action</button></mat-menu>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <!-- Awaiting me: a merged feed, so it has its own shape -->
      <mat-table [dataSource]="awaiting" *ngIf="!loading && tabIndex === 0 && awaiting.length">
        <ng-container matColumnDef="document">
          <mat-header-cell *matHeaderCellDef>Document</mat-header-cell>
          <mat-cell *matCellDef="let w">
            <span>
              <span style="display:block;font-weight:500">{{ w.name }}</span>
              <span class="muted" style="display:block;font-size:12px">{{ w.requester.displayName }} · {{ w.requester.unitName }}</span>
            </span>
          </mat-cell>
        </ng-container>
        <ng-container matColumnDef="seal">
          <mat-header-cell *matHeaderCellDef>Seal</mat-header-cell>
          <mat-cell *matCellDef="let w"><span class="badge b-neutral" *ngIf="w.seal">{{ seal(w.seal) }}</span></mat-cell>
        </ng-container>
        <ng-container matColumnDef="waiting">
          <mat-header-cell *matHeaderCellDef>Waiting</mat-header-cell>
          <mat-cell *matCellDef="let w">{{ age(w.waitingSince) }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="action">
          <mat-header-cell *matHeaderCellDef>Needs</mat-header-cell>
          <mat-cell *matCellDef="let w"><span class="badge" [class.b-review]="w.action !== 'SIGN'" [class.b-pending]="w.action === 'SIGN'">{{ actionLabel(w.action) }}</span></mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="awaitingCols"></mat-header-row>
        <mat-row *matRowDef="let w; columns: awaitingCols" class="clickable-row" (click)="openWork(w)"></mat-row>
      </mat-table>

      <!-- The three document lists share one shape -->
      <mat-table [dataSource]="rows" *ngIf="!loading && tabIndex !== 0 && rows.length">
        <ng-container matColumnDef="document">
          <mat-header-cell *matHeaderCellDef>Document</mat-header-cell>
          <mat-cell *matCellDef="let d">
            <span>
              <span style="display:block;font-weight:500">{{ d.name }}</span>
              <span class="muted" style="display:block;font-size:12px">{{ d.subtitle }}</span>
            </span>
          </mat-cell>
        </ng-container>
        <ng-container matColumnDef="seal">
          <mat-header-cell *matHeaderCellDef>Seal</mat-header-cell>
          <mat-cell *matCellDef="let d"><span class="badge b-neutral" *ngIf="d.seal">{{ seal(d.seal) }}</span></mat-cell>
        </ng-container>
        <ng-container matColumnDef="updated">
          <mat-header-cell *matHeaderCellDef>Updated</mat-header-cell>
          <mat-cell *matCellDef="let d">{{ d.updatedAt | date:'dd MMM, HH:mm' }}</mat-cell>
        </ng-container>
        <ng-container matColumnDef="status">
          <mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
          <mat-cell *matCellDef="let d"><staff-badge [status]="d.status"></staff-badge></mat-cell>
        </ng-container>
        <mat-header-row *matHeaderRowDef="docCols"></mat-header-row>
        <mat-row *matRowDef="let d; columns: docCols" class="clickable-row" (click)="openDocument(d)"></mat-row>
      </mat-table>

      <div *ngIf="!loading && isEmpty()" class="muted" style="text-align:center;padding:56px">
        <div style="font-size:15px">{{ emptyTitle() }}</div>
        <div style="font-size:13px;margin-top:6px">{{ emptyHint() }}</div>
      </div>
    </div>
  `,
  styles: [`
    .tab-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 20px; height: 20px; padding: 0 6px; margin-left: 8px;
      border-radius: 10px; background: #3f51b5; color: #fff;
      font-size: 11px; font-weight: 600;
    }
    .filter-chip { border-radius: 16px; height: 32px; line-height: 32px; padding: 0 12px; font-size: 13px; }
    .filter-chip mat-icon { font-size: 18px; width: 18px; height: 18px; vertical-align: middle; }
    mat-cell, mat-header-cell { padding-right: 12px; }
  `],
})
export class DocumentsListComponent implements OnInit {
  awaitingCols = ['document', 'seal', 'waiting', 'action'];
  docCols = ['document', 'seal', 'updated', 'status'];

  tabIndex = 0;
  loading = false;
  awaiting: WorkItem[] = [];
  rows: DocumentSummary[] = [];
  unitLine = 'Finance · Technology Division';

  constructor(private readonly api: StaffApi, private readonly router: Router) {}

  ngOnInit() {
    this.selectTab(0);
  }

  selectTab(i: number) {
    this.tabIndex = i;
    this.loading = true;

    // "Awaiting me" is a different shape from the three document lists, so it
    // gets its own branch rather than a union the compiler cannot narrow.
    if (i === 0) {
      this.api.awaitingMe().subscribe((items) => {
        this.awaiting = items;
        this.rows = [];
        this.loading = false;
      });
      return;
    }

    const source: Observable<DocumentSummary[]> =
      i === 1 ? this.api.myDocuments()
      : i === 2 ? this.api.sentForSignature()
      : this.api.myStampRequests();

    source.subscribe((data) => {
      this.rows = data;
      this.awaiting = [];
      this.loading = false;
    });
  }

  isEmpty(): boolean {
    return this.tabIndex === 0 ? this.awaiting.length === 0 : this.rows.length === 0;
  }

  emptyTitle(): string {
    return this.tabIndex === 0 ? 'Nothing is waiting on you.' : 'Nothing here yet.';
  }

  emptyHint(): string {
    switch (this.tabIndex) {
      case 0: return 'Documents sent to you to sign, and stamp requests to review, appear here.';
      case 2: return 'Documents you send to colleagues to sign will appear here.';
      case 3: return 'Stamp requests you raise will appear here.';
      default: return 'Documents you sign or stamp will appear here.';
    }
  }

  seal = sealLabel;
  age = waitingAge;

  actionLabel(action: string): string {
    return action === 'SIGN' ? 'Sign' : action === 'REVIEW' ? 'Review' : 'Approve';
  }

  openWork(w: WorkItem) {
    if (w.action === 'SIGN') { this.router.navigate(['/staff/documents', w.documentId]); return; }
    this.router.navigate(['/staff/awaiting'], { queryParams: { item: w.id } });
  }

  openDocument(d: DocumentSummary) {
    const isOpenRequest = ['DRAFT', 'AWAITING_REVIEW', 'AWAITING_APPROVAL', 'REJECTED'].includes(d.status);
    this.router.navigate(isOpenRequest ? ['/staff/stamps', d.id] : ['/staff/documents', d.id]);
  }

  newStampRequest() { this.router.navigate(['/staff/stamps', 'd-lease']); }

  notImplemented(what: string) {
    // S4 territory — the screens exist, the endpoints do not yet.
    console.info(`${what} lands with the signing work in S4`);
  }
}
