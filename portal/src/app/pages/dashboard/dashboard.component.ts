import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of, catchError } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';

interface Stats {
  totalEntities: number; approvedEntities: number;
  openCases: number; relationships: number; issuedCerts: number; auditEvents: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIf, NgFor, RouterLink, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container">
      <h1 style="margin:0 0 24px;font-size:24px;font-weight:500">Dashboard</h1>

      <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <ng-container *ngIf="!loading && stats">
        <div class="card-grid" style="margin-bottom:32px">
          <mat-card routerLink="/entities" style="cursor:pointer"><mat-card-content style="padding:20px">
            <div style="font-size:36px;font-weight:700;color:#3f51b5">{{ stats.totalEntities }}</div>
            <div class="muted" style="margin-top:4px">Legal Entities</div>
            <div style="font-size:12px;margin-top:8px"><span class="badge b-approved">{{ stats.approvedEntities }} approved</span></div>
          </mat-card-content></mat-card>

          <mat-card routerLink="/verification-cases" style="cursor:pointer"><mat-card-content style="padding:20px">
            <div style="font-size:36px;font-weight:700;color:#3f51b5">{{ stats.openCases }}</div>
            <div class="muted" style="margin-top:4px">Open Verification Cases</div>
          </mat-card-content></mat-card>

          <mat-card routerLink="/relationships" style="cursor:pointer"><mat-card-content style="padding:20px">
            <div style="font-size:36px;font-weight:700;color:#3f51b5">{{ stats.relationships }}</div>
            <div class="muted" style="margin-top:4px">Relationships</div>
          </mat-card-content></mat-card>

          <mat-card routerLink="/requests" style="cursor:pointer"><mat-card-content style="padding:20px">
            <div style="font-size:36px;font-weight:700;color:#3f51b5">{{ stats.issuedCerts }}</div>
            <div class="muted" style="margin-top:4px">Issued Certificates</div>
          </mat-card-content></mat-card>

          <mat-card *ngIf="auth.has('audit:read')" routerLink="/audit" style="cursor:pointer"><mat-card-content style="padding:20px">
            <div style="font-size:36px;font-weight:700;color:#3f51b5">{{ stats.auditEvents }}</div>
            <div class="muted" style="margin-top:4px">Audit Events</div>
          </mat-card-content></mat-card>
        </div>

        <mat-card>
          <mat-card-header>
            <mat-card-title>Legal Identity Lifecycle</mat-card-title>
            <mat-card-subtitle>The governed path from onboarding to a verified certificate</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
              <div *ngFor="let s of steps; let i = index" style="display:flex;align-items:flex-start;gap:16px">
                <div style="width:28px;height:28px;border-radius:50%;background:#3f51b5;color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">{{ i + 1 }}</div>
                <div>
                  <div style="font-weight:500">{{ s.title }}</div>
                  <div class="muted" style="margin-top:2px">{{ s.desc }}</div>
                  <a mat-button color="primary" [routerLink]="s.link" style="margin-top:4px;padding-left:0">{{ s.cta }} &rarr;</a>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </ng-container>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  stats: Stats | null = null;
  loading = false;
  steps = [
    { title: 'Register a Legal Entity', desc: 'Create a PERSON or ORGANISATION record with its name and country.', link: '/entities/new', cta: 'Register Entity' },
    { title: 'Complete the Profile', desc: 'Open the entity and fill its person or organisation profile.', link: '/entities', cta: 'Go to Entities' },
    { title: 'Run KYC / KYB Verification', desc: 'Create a verification case, upload evidence, then submit, review and approve under 4-eyes.', link: '/verification-cases', cta: 'Verification Cases' },
    { title: 'Request a Certificate', desc: 'Once the entity is APPROVED, submit a CSR linked to it.', link: '/requests/new', cta: 'Submit CSR' },
    { title: 'Issue & Verify', desc: 'Issue the certificate (requires cert:issue) and verify it via the public endpoint.', link: '/requests', cta: 'View Requests' },
  ];

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    this.loading = true;
    forkJoin({
      entities: this.api.listEntities(1, 1).pipe(catchError(() => of({ total: 0 } as any))),
      approved: this.api.listEntities(1, 1, 'APPROVED').pipe(catchError(() => of({ total: 0 } as any))),
      cases: this.api.listCases({ status: 'UNDER_REVIEW', limit: 1 }).pipe(catchError(() => of({ total: 0 } as any))),
      rels: this.api.listRelationships({ limit: 1 }).pipe(catchError(() => of({ total: 0 } as any))),
      issued: this.api.listRequests(1, 1, 'ISSUED').pipe(catchError(() => of({ total: 0 } as any))),
      audit: this.api.listAuditLogs({ limit: 1 }).pipe(catchError(() => of({ total: 0 } as any))),
    }).subscribe({
      next: (r) => {
        this.stats = {
          totalEntities: r.entities.total,
          approvedEntities: r.approved.total,
          openCases: r.cases.total,
          relationships: r.rels.total,
          issuedCerts: r.issued.total,
          auditEvents: r.audit.total,
        };
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }
}
