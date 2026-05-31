import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIf, DatePipe, JsonPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, ObjectRecord } from '../../../core/api.service';

@Component({
  selector: 'app-object-detail',
  standalone: true,
  imports: [NgIf, DatePipe, JsonPipe, RouterLink, MatButtonModule, MatCardModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container">
      <div style="margin-bottom:16px">
        <a mat-button routerLink="/objects" style="padding-left:0">&larr; Back to Objects</a>
      </div>

      <div *ngIf="loading" style="text-align:center;padding:60px">
        <mat-spinner diameter="36" style="margin:auto"></mat-spinner>
      </div>

      <ng-container *ngIf="!loading && obj">
        <div class="page-header">
          <h1>{{ obj.objectType }}: {{ obj.reference }}</h1>
          <span class="status-chip status-NEW">{{ obj.objectType }}</span>
        </div>

        <mat-card>
          <mat-card-content>
            <div class="detail-grid" style="margin-top:8px">
              <span class="label">Object ID</span><span class="value" style="font-size:12px;font-family:monospace">{{ obj.id }}</span>
              <span class="label">Type</span><span class="value">{{ obj.objectType }}</span>
              <span class="label">Reference</span><span class="value">{{ obj.reference }}</span>
              <span class="label">Entity</span>
              <span class="value">
                <a *ngIf="obj.entityId" [routerLink]="['/entities', obj.entityId]">{{ obj.entityName || obj.entityId }}</a>
                <span *ngIf="!obj.entityId">—</span>
              </span>
              <span class="label">Created</span><span class="value">{{ obj.createdAt | date:'dd MMM yyyy HH:mm:ss' }}</span>
            </div>
            <div *ngIf="obj.metadata" style="margin-top:16px">
              <div style="font-size:13px;color:rgba(0,0,0,0.6);margin-bottom:4px">Metadata</div>
              <div class="pem-box">{{ obj.metadata | json }}</div>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>
    </div>
  `
})
export class ObjectDetailComponent implements OnInit {
  obj: ObjectRecord | null = null;
  loading = false;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading = true;
    this.api.getObject(id).subscribe({
      next: (o) => { this.obj = o; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }
}
