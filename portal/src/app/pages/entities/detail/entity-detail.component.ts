import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, Entity, PersonProfile, OrgProfile, VerificationCase, Relationship } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-entity-detail',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTableModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container" *ngIf="!loading && entity">
      <div class="page-header">
        <h1>{{ entity.name }}
          <span class="badge b-neutral">{{ entity.entityType }}</span>
          <status-badge [status]="entity.status"></status-badge>
        </h1>
        <a mat-button routerLink="/entities">← Back</a>
      </div>

      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <div class="detail-grid">
          <div class="label">Entity ID</div><div class="value">{{ entity.id }}</div>
          <div class="label">Country</div><div class="value">{{ entity.country }}</div>
          <div class="label">Status</div><div class="value"><status-badge [status]="entity.status"></status-badge></div>
          <div class="label">KYC Status</div><div class="value"><status-badge [status]="entity.kycStatus"></status-badge></div>
          <div class="label">Registered</div><div class="value">{{ entity.createdAt | date:'medium' }}</div>
        </div>
        <div class="inline-actions">
          <button *ngIf="auth.has('entity:onboard')" mat-raised-button color="primary" (click)="newCase()">
            Start {{ entity.entityType === 'PERSON' ? 'KYC' : 'KYB' }} Case
          </button>
        </div>

        <!-- Two ways to obtain a certificate -->
        <div *ngIf="auth.hasAny('cert:request','cert:issue')" style="margin-top:12px">
          <div class="muted" style="margin-bottom:6px">Certificate options</div>
          <div class="inline-actions">
            <button *ngIf="auth.has('cert:request')" mat-stroked-button (click)="newRequest()">
              Paste a CSR (entity holds the key)
            </button>
            <button *ngIf="auth.has('cert:issue')" mat-raised-button color="accent"
                    [disabled]="entity.status !== 'APPROVED' || issuingManaged" (click)="issueManaged()">
              <mat-spinner diameter="16" *ngIf="issuingManaged" style="display:inline-block;margin-right:6px"></mat-spinner>
              Issue Managed Certificate (HSM escrow)
            </button>
          </div>
          <div class="muted" style="margin-top:4px">
            Managed issuance generates the private key inside the HSM (no CSR needed); it requires the entity to be APPROVED.
          </div>
        </div>
      </mat-card-content></mat-card>

      <!-- Profile editor -->
      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">{{ entity.entityType === 'PERSON' ? 'Person' : 'Organisation' }} Profile
          <span class="muted" *ngIf="!profileExists">(not yet created)</span>
        </h3>

        <div *ngIf="entity.entityType === 'PERSON'">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
            <mat-form-field appearance="outline"><mat-label>First name</mat-label><input matInput [(ngModel)]="person.firstName"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Last name</mat-label><input matInput [(ngModel)]="person.lastName"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Date of birth</mat-label><input matInput type="date" [(ngModel)]="person.dateOfBirth"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Nationality</mat-label><input matInput [(ngModel)]="person.nationality" placeholder="LS"></mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>ID type</mat-label>
              <mat-select [(ngModel)]="person.idType"><mat-option *ngFor="let t of personIdTypes" [value]="t">{{ t }}</mat-option></mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline"><mat-label>ID number</mat-label><input matInput [(ngModel)]="person.idNumber"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Address line 1</mat-label><input matInput [(ngModel)]="person.addressLine1"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>City</mat-label><input matInput [(ngModel)]="person.city"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Address country</mat-label><input matInput [(ngModel)]="person.addressCountry" placeholder="LS"></mat-form-field>
          </div>
        </div>

        <div *ngIf="entity.entityType === 'ORGANISATION'">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
            <mat-form-field appearance="outline"><mat-label>Legal name</mat-label><input matInput [(ngModel)]="org.legalName"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Trading name</mat-label><input matInput [(ngModel)]="org.tradingName"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Registration number</mat-label><input matInput [(ngModel)]="org.registrationNumber"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Registration country</mat-label><input matInput [(ngModel)]="org.registrationCountry" placeholder="LS"></mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Business type</mat-label>
              <mat-select [(ngModel)]="org.businessType"><mat-option *ngFor="let t of businessTypes" [value]="t">{{ t }}</mat-option></mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Industry sector</mat-label><input matInput [(ngModel)]="org.industrySector"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Reg. address line 1</mat-label><input matInput [(ngModel)]="org.regAddressLine1"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Reg. city</mat-label><input matInput [(ngModel)]="org.regCity"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Reg. country</mat-label><input matInput [(ngModel)]="org.regCountry" placeholder="LS"></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Contact email</mat-label><input matInput [(ngModel)]="org.contactEmail"></mat-form-field>
          </div>
        </div>

        <button *ngIf="auth.has('entity:update')" mat-raised-button color="primary" [disabled]="savingProfile" (click)="saveProfile()">
          {{ profileExists ? 'Update Profile' : 'Create Profile' }}
        </button>
        <span *ngIf="!auth.has('entity:update')" class="muted">You do not have permission to edit profiles.</span>
      </mat-card-content></mat-card>

      <!-- Verification cases -->
      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Verification Cases</h3>
        <mat-table [dataSource]="cases" *ngIf="cases.length">
          <ng-container matColumnDef="caseType"><mat-header-cell *matHeaderCellDef>Type</mat-header-cell>
            <mat-cell *matCellDef="let c">{{ c.caseType }}</mat-cell></ng-container>
          <ng-container matColumnDef="status"><mat-header-cell *matHeaderCellDef>Status</mat-header-cell>
            <mat-cell *matCellDef="let c"><status-badge [status]="c.status"></status-badge></mat-cell></ng-container>
          <ng-container matColumnDef="createdAt"><mat-header-cell *matHeaderCellDef>Created</mat-header-cell>
            <mat-cell *matCellDef="let c">{{ c.createdAt | date:'dd MMM yyyy' }}</mat-cell></ng-container>
          <mat-header-row *matHeaderRowDef="caseCols"></mat-header-row>
          <mat-row *matRowDef="let c; columns: caseCols" class="clickable-row" (click)="openCase(c)"></mat-row>
        </mat-table>
        <div *ngIf="!cases.length" class="muted">No verification cases yet.</div>
      </mat-card-content></mat-card>

      <!-- Relationships -->
      <mat-card><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Relationships</h3>
        <div *ngFor="let r of relationships" style="padding:6px 0;border-bottom:1px solid #f0f0f0">
          <span style="font-weight:500">{{ r.subjectEntity?.name }}</span>
          <span class="badge b-neutral" style="margin:0 6px">{{ r.relationshipType }}</span>
          <span style="font-weight:500">{{ r.objectEntity?.name }}</span>
          <status-badge [status]="r.status" style="margin-left:8px"></status-badge>
        </div>
        <div *ngIf="!relationships.length" class="muted">No relationships.</div>
      </mat-card-content></mat-card>
    </div>

    <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>
  `,
})
export class EntityDetailComponent implements OnInit {
  id!: string;
  entity: Entity | null = null;
  loading = true;
  profileExists = false;
  savingProfile = false;
  issuingManaged = false;

  person: PersonProfile = { firstName: '', lastName: '', dateOfBirth: '', nationality: '', idType: 'NATIONAL_ID', idNumber: '', addressLine1: '', city: '', addressCountry: '' };
  org: OrgProfile = { legalName: '', registrationNumber: '', registrationCountry: '', businessType: 'PRIVATE_LIMITED', regAddressLine1: '', regCity: '', regCountry: '' };

  personIdTypes = ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENCE', 'BIRTH_CERTIFICATE', 'RESIDENCE_PERMIT'];
  businessTypes = ['SOLE_PROPRIETOR', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'TRUST', 'NGO', 'COOPERATIVE', 'GOVERNMENT_ENTITY', 'OTHER'];

  cases: VerificationCase[] = [];
  caseCols = ['caseType', 'status', 'createdAt'];
  relationships: Relationship[] = [];

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router, public auth: AuthService, private notify: NotifyService) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.api.getEntity(this.id).subscribe({
      next: (e) => { this.entity = e; this.loading = false; this.loadProfile(); this.loadCases(); this.loadRelationships(); },
      error: () => { this.loading = false; },
    });
  }

  loadProfile() {
    if (!this.entity) return;
    if (this.entity.entityType === 'PERSON') {
      this.api.getPersonProfile(this.id).subscribe({
        next: (p) => { this.person = { ...p, dateOfBirth: (p.dateOfBirth || '').slice(0, 10) }; this.profileExists = true; },
        error: () => { this.profileExists = false; },
      });
    } else {
      this.api.getOrgProfile(this.id).subscribe({
        next: (p) => { this.org = p; this.profileExists = true; },
        error: () => { this.profileExists = false; },
      });
    }
  }

  loadCases() { this.api.listCases({ entityId: this.id }).subscribe({ next: (p) => this.cases = p.items, error: () => {} }); }
  loadRelationships() { this.api.listEntityRelationships(this.id).subscribe({ next: (p) => this.relationships = p.items, error: () => {} }); }

  saveProfile() {
    if (!this.entity) return;
    this.savingProfile = true;
    const obs: Observable<PersonProfile | OrgProfile> = this.entity.entityType === 'PERSON'
      ? this.api.upsertPersonProfile(this.id, this.person)
      : this.api.upsertOrgProfile(this.id, this.org);
    obs.subscribe({
      next: () => { this.notify.success('Profile saved'); this.savingProfile = false; this.profileExists = true;
        this.api.getEntity(this.id).subscribe({ next: (e) => this.entity = e }); },
      error: (e: any) => { this.notify.error(this.notify.fromError(e, 'Could not save profile')); this.savingProfile = false; },
    });
  }

  newCase() { this.router.navigate(['/verification-cases/new'], { queryParams: { entityId: this.id, entityType: this.entity?.entityType } }); }
  newRequest() { this.router.navigate(['/requests/new'], { queryParams: { entityId: this.id } }); }
  openCase(c: VerificationCase) { this.router.navigate(['/verification-cases', c.id]); }

  issueManaged() {
    if (!this.entity || this.issuingManaged) return;
    this.issuingManaged = true;
    this.api.issueManagedCertificate(this.entity.id).subscribe({
      next: (c) => {
        this.issuingManaged = false;
        this.notify.success(`Managed certificate issued — serial ${c.serial} (key in HSM)`);
        this.router.navigate(['/verify'], { queryParams: { s: c.serial } });
      },
      error: (e: any) => { this.issuingManaged = false; this.notify.error(this.notify.fromError(e, 'Managed issuance failed')); },
    });
  }
}
