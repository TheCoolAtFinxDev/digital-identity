import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { ApiService, Entity } from '../../../core/api.service';
import { NotifyService } from '../../../core/notify.service';

@Component({
  selector: 'app-create-case',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <div class="page-container form-narrow">
      <div class="page-header"><h1>New Verification Case</h1><a mat-button routerLink="/verification-cases">← Back</a></div>
      <mat-card><mat-card-content style="padding-top:16px">
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Entity</mat-label>
          <mat-select [(ngModel)]="entityId" (ngModelChange)="onEntityChange()">
            <mat-option *ngFor="let e of entities" [value]="e.id">{{ e.name }} ({{ e.entityType }})</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Case type</mat-label>
          <mat-select [(ngModel)]="caseType">
            <mat-option value="KYC">KYC (person)</mat-option>
            <mat-option value="KYB">KYB (organisation)</mat-option>
            <mat-option value="RE_VERIFICATION">Re-verification</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Priority</mat-label>
          <mat-select [(ngModel)]="priority">
            <mat-option value="LOW">Low</mat-option>
            <mat-option value="NORMAL">Normal</mat-option>
            <mat-option value="HIGH">High</mat-option>
            <mat-option value="URGENT">Urgent</mat-option>
          </mat-select>
        </mat-form-field>
        <p class="muted">KYC applies to PERSON entities, KYB to ORGANISATION entities.</p>
        <button mat-raised-button color="primary" [disabled]="!entityId || !caseType || saving" (click)="submit()">Create Case</button>
      </mat-card-content></mat-card>
    </div>
  `,
})
export class CreateCaseComponent implements OnInit {
  entities: Entity[] = [];
  entityId = '';
  caseType = '';
  priority = 'NORMAL';
  saving = false;

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router, private notify: NotifyService) {}

  ngOnInit() {
    this.entityId = this.route.snapshot.queryParamMap.get('entityId') || '';
    const et = this.route.snapshot.queryParamMap.get('entityType');
    if (et === 'PERSON') this.caseType = 'KYC';
    else if (et === 'ORGANISATION') this.caseType = 'KYB';
    this.api.listEntities(1, 100).subscribe({ next: (p) => this.entities = p.data, error: () => {} });
  }

  onEntityChange() {
    const e = this.entities.find((x) => x.id === this.entityId);
    if (e && !this.caseType) this.caseType = e.entityType === 'PERSON' ? 'KYC' : 'KYB';
  }

  submit() {
    this.saving = true;
    this.api.createCase({ entityId: this.entityId, caseType: this.caseType, priority: this.priority }).subscribe({
      next: (c) => { this.notify.success('Case created'); this.router.navigate(['/verification-cases', c.id]); },
      error: (e: any) => { this.notify.error(this.notify.fromError(e, 'Could not create case')); this.saving = false; },
    });
  }
}
