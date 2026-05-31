import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService, User, Role, RoleAssignment } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [NgFor, NgIf, DatePipe, FormsModule, RouterLink, MatCardModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTableModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <div class="page-container" *ngIf="!loading">
      <div class="page-header">
        <h1>{{ user?.username }} <status-badge [status]="user?.isActive ? 'ACTIVE' : 'INACTIVE'"></status-badge></h1>
        <a mat-button routerLink="/users">← Back</a>
      </div>

      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <div class="detail-grid">
          <div class="label">User ID</div><div class="value">{{ user?.id }}</div>
          <div class="label">Email</div><div class="value">{{ user?.email }}</div>
          <div class="label">Display name</div><div class="value">{{ user?.displayName || '—' }}</div>
          <div class="label">Created</div><div class="value">{{ user?.createdAt | date:'medium' }}</div>
        </div>
        <div class="inline-actions" style="margin-top:8px">
          <button *ngIf="auth.has('user:deactivate') && user?.isActive" mat-stroked-button color="warn" (click)="deactivate()">Deactivate</button>
          <button *ngIf="auth.has('user:update')" mat-stroked-button (click)="showPwd = !showPwd">Reset Password</button>
        </div>
        <div *ngIf="showPwd" class="inline-actions" style="margin-top:12px">
          <mat-form-field appearance="outline" style="width:260px">
            <mat-label>New password</mat-label>
            <input matInput type="password" [(ngModel)]="newPassword" minlength="8">
          </mat-form-field>
          <button mat-raised-button color="primary" [disabled]="newPassword.length < 8" (click)="resetPassword()">Save</button>
        </div>
      </mat-card-content></mat-card>

      <mat-card><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Role Assignments</h3>

        <div *ngIf="auth.has('user:assign-role')" class="inline-actions" style="margin-bottom:16px">
          <mat-form-field appearance="outline" style="width:220px">
            <mat-label>Role</mat-label>
            <mat-select [(ngModel)]="selRole">
              <mat-option *ngFor="let r of roles" [value]="r.id">{{ r.code }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:170px">
            <mat-label>Scope</mat-label>
            <mat-select [(ngModel)]="selScope">
              <mat-option value="GLOBAL">GLOBAL</mat-option>
              <mat-option value="ENTITY">ENTITY</mat-option>
              <mat-option value="ORGANISATION">ORGANISATION</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:280px" *ngIf="selScope !== 'GLOBAL'">
            <mat-label>Scope ID (entity)</mat-label>
            <input matInput [(ngModel)]="selScopeId" placeholder="entity UUID">
          </mat-form-field>
          <button mat-raised-button color="primary" [disabled]="!selRole || assigning" (click)="assign()">Assign Role</button>
        </div>

        <mat-table [dataSource]="assignments">
          <ng-container matColumnDef="role">
            <mat-header-cell *matHeaderCellDef>Role</mat-header-cell>
            <mat-cell *matCellDef="let a" style="font-weight:500">{{ a.role?.code || a.roleId }}</mat-cell>
          </ng-container>
          <ng-container matColumnDef="scope">
            <mat-header-cell *matHeaderCellDef>Scope</mat-header-cell>
            <mat-cell *matCellDef="let a">{{ a.scope }}{{ a.scopeId ? ' · ' + a.scopeId.slice(0,8) : '' }}</mat-cell>
          </ng-container>
          <ng-container matColumnDef="assignedAt">
            <mat-header-cell *matHeaderCellDef>Assigned</mat-header-cell>
            <mat-cell *matCellDef="let a">{{ a.assignedAt | date:'dd MMM yyyy' }}</mat-cell>
          </ng-container>
          <ng-container matColumnDef="actions">
            <mat-header-cell *matHeaderCellDef></mat-header-cell>
            <mat-cell *matCellDef="let a">
              <button *ngIf="auth.has('user:assign-role')" mat-button color="warn" (click)="revoke(a)">Revoke</button>
            </mat-cell>
          </ng-container>
          <mat-header-row *matHeaderRowDef="acols"></mat-header-row>
          <mat-row *matRowDef="let a; columns: acols"></mat-row>
        </mat-table>
        <div *ngIf="assignments.length === 0" class="muted" style="padding:16px 0">No active role assignments.</div>
      </mat-card-content></mat-card>
    </div>

    <div *ngIf="loading" style="text-align:center;padding:60px"><mat-spinner diameter="36" style="margin:auto"></mat-spinner></div>
  `,
})
export class UserDetailComponent implements OnInit {
  id!: string;
  user: User | null = null;
  roles: Role[] = [];
  assignments: RoleAssignment[] = [];
  acols = ['role', 'scope', 'assignedAt', 'actions'];
  loading = true;
  showPwd = false; newPassword = '';
  selRole = ''; selScope = 'GLOBAL'; selScopeId = ''; assigning = false;

  constructor(private api: ApiService, private route: ActivatedRoute, public auth: AuthService, private notify: NotifyService) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.api.getUser(this.id).subscribe({
      next: (u) => { this.user = u; this.loading = false; },
      error: () => { this.loading = false; },
    });
    this.loadRoles();
    if (this.auth.has('user:read')) this.loadAssignments();
    if (this.auth.has('user:assign-role')) this.api.listRoles().subscribe({ next: (r) => this.roles = r, error: () => {} });
  }

  loadRoles() {}
  loadAssignments() {
    this.api.getUserRoles(this.id).subscribe({ next: (a) => this.assignments = a, error: () => {} });
  }

  assign() {
    if (!this.selRole) return;
    this.assigning = true;
    const body: any = { roleId: this.selRole, scope: this.selScope };
    if (this.selScope !== 'GLOBAL' && this.selScopeId) body.scopeId = this.selScopeId;
    this.api.assignRole(this.id, body).subscribe({
      next: () => { this.notify.success('Role assigned'); this.assigning = false; this.selRole = ''; this.selScopeId = ''; this.loadAssignments(); },
      error: (e: any) => { this.notify.error(this.notify.fromError(e, 'Could not assign role')); this.assigning = false; },
    });
  }

  revoke(a: RoleAssignment) {
    this.api.revokeRole(this.id, a.id).subscribe({
      next: () => { this.notify.success('Role revoked'); this.loadAssignments(); },
      error: (e: any) => this.notify.error(this.notify.fromError(e, 'Could not revoke role')),
    });
  }

  deactivate() {
    this.api.deactivateUser(this.id).subscribe({
      next: (u) => { this.user = u; this.notify.success('User deactivated'); },
      error: (e: any) => this.notify.error(this.notify.fromError(e, 'Could not deactivate')),
    });
  }

  resetPassword() {
    this.api.changePassword(this.id, this.newPassword).subscribe({
      next: () => { this.notify.success('Password updated'); this.showPwd = false; this.newPassword = ''; },
      error: (e: any) => this.notify.error(this.notify.fromError(e, 'Could not update password')),
    });
  }
}
