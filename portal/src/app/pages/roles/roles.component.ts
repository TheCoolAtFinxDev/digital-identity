import { Component, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, Role, Permission } from '../../core/api.service';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [NgFor, NgIf, MatCardModule, MatExpansionModule, MatTabsModule, MatTableModule, MatProgressSpinnerModule],
  template: `
    <div class="page-container">
      <div class="page-header"><h1>Roles &amp; Permissions</h1></div>

      <div *ngIf="loading" style="text-align:center;padding:40px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>

      <mat-tab-group *ngIf="!loading">
        <mat-tab label="Roles ({{ roles.length }})">
          <div style="padding-top:16px">
            <mat-accordion>
              <mat-expansion-panel *ngFor="let r of roles">
                <mat-expansion-panel-header>
                  <mat-panel-title style="font-weight:600">{{ r.code }}</mat-panel-title>
                  <mat-panel-description>{{ r.name }} · {{ r.permissions?.length || 0 }} permissions</mat-panel-description>
                </mat-expansion-panel-header>
                <p class="muted">{{ r.description }}</p>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  <span *ngFor="let p of r.permissions" class="badge b-neutral">{{ p.permission.code }}</span>
                </div>
              </mat-expansion-panel>
            </mat-accordion>
          </div>
        </mat-tab>

        <mat-tab label="Permissions ({{ permissions.length }})">
          <div style="padding-top:16px">
            <mat-table [dataSource]="permissions">
              <ng-container matColumnDef="code">
                <mat-header-cell *matHeaderCellDef>Code</mat-header-cell>
                <mat-cell *matCellDef="let p" style="font-weight:500">{{ p.code }}</mat-cell>
              </ng-container>
              <ng-container matColumnDef="name">
                <mat-header-cell *matHeaderCellDef>Name</mat-header-cell>
                <mat-cell *matCellDef="let p">{{ p.name }}</mat-cell>
              </ng-container>
              <ng-container matColumnDef="resource">
                <mat-header-cell *matHeaderCellDef>Resource</mat-header-cell>
                <mat-cell *matCellDef="let p">{{ p.resource }}</mat-cell>
              </ng-container>
              <ng-container matColumnDef="action">
                <mat-header-cell *matHeaderCellDef>Action</mat-header-cell>
                <mat-cell *matCellDef="let p">{{ p.action }}</mat-cell>
              </ng-container>
              <mat-header-row *matHeaderRowDef="cols"></mat-header-row>
              <mat-row *matRowDef="let p; columns: cols"></mat-row>
            </mat-table>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export class RolesComponent implements OnInit {
  roles: Role[] = [];
  permissions: Permission[] = [];
  cols = ['code', 'name', 'resource', 'action'];
  loading = true;

  constructor(private api: ApiService) {}

  ngOnInit() {
    let done = 0;
    const fin = () => { if (++done === 2) this.loading = false; };
    this.api.listRoles().subscribe({ next: (r) => { this.roles = r; fin(); }, error: fin });
    this.api.listPermissions().subscribe({ next: (p) => { this.permissions = p; fin(); }, error: fin });
  }
}
