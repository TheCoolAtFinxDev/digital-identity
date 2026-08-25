import { Component, OnInit } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import {
  ApiService, ApprovalChain, OrgUnitDetail, OrgUnitRef, OrgUnitType, User,
} from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';

@Component({
  selector: 'app-org-unit-detail',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, FormsModule, RouterLink, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule,
  ],
  template: `
    <div class="page-container" *ngIf="!loading && unit">
      <div class="muted" style="margin-bottom:8px;font-size:13px">
        <a routerLink="/org-units">Organisation chart</a>
        <ng-container *ngFor="let a of breadcrumb()">
          &nbsp;/&nbsp;<a [routerLink]="['/org-units', a.id]">{{ a.name }}</a>
        </ng-container>
        &nbsp;/&nbsp;{{ unit.name }}
      </div>

      <div class="page-header">
        <div>
          <h1 style="margin:0">{{ unit.name }}</h1>
          <div class="inline-actions" style="margin-top:6px">
            <span class="badge" [ngClass]="typeClass(unit.unitType)">{{ label(unit.unitType) }}</span>
            <span class="badge b-neutral" *ngIf="unit.code">{{ unit.code }}</span>
            <span class="badge b-inactive" *ngIf="!unit.isActive">Deactivated</span>
          </div>
        </div>
      </div>

      <!-- Who approves for this unit -->
      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Who releases this unit's stamp</h3>

        <div class="detail-grid">
          <div class="label">Head of unit</div>
          <div class="value">
            <ng-container *ngIf="!unit.headVacant">
              {{ unit.head?.displayName || unit.head?.username }}
            </ng-container>
            <span *ngIf="unit.headVacant" style="color:#f57f17;font-weight:500">
              {{ unit.headUserId ? 'Appointed head is deactivated — the seat is vacant' : 'Vacant' }}
            </span>
          </div>
          <div class="label">People in this unit</div>
          <div class="value">{{ unit.members.length }}</div>
          <div class="label">Sub-units</div>
          <div class="value">{{ unit.children.length || '—' }}</div>
        </div>

        <p class="muted" style="margin:12px 0 0">
          The head approves stamp requests raised by people in this unit. A person's own
          line manager reviews first — four eyes follows the reporting line, not a pool.
        </p>

        <div *ngIf="auth.has('orgunit:update') && unit.isActive" style="margin-top:16px">
          <div class="inline-actions">
            <mat-form-field appearance="outline" style="width:320px">
              <mat-label>Appoint head</mat-label>
              <mat-select [(ngModel)]="headChoice">
                <mat-option value="">— leave the seat vacant —</mat-option>
                <mat-option *ngFor="let u of activeUsers" [value]="u.id">
                  {{ u.displayName || u.username }}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-raised-button color="primary" [disabled]="working || headChoice === (unit.headUserId ?? '')"
                    (click)="saveHead()">Save head</button>
          </div>
        </div>
      </mat-card-content></mat-card>

      <!-- People -->
      <mat-card style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">People</h3>

        <p class="muted" *ngIf="!unit.members.length" style="margin:0 0 12px">
          Nobody is placed in this unit yet.
        </p>

        <div *ngFor="let m of unit.members" class="member">
          <span style="flex:1 1 auto;min-width:0">
            <span style="font-weight:500">{{ m.displayName || m.username }}</span>
            <span class="badge b-neutral" *ngIf="m.id === unit.headUserId" style="margin-left:8px">Head</span>
            <span class="muted" style="display:block;font-size:12px;margin-top:2px">
              {{ m.managerId ? 'Reports to ' + nameOf(m.managerId) : 'No line manager — cannot raise a stamp request' }}
            </span>
          </span>
          <button mat-button color="primary" (click)="checkChain(m.id)">Check routing</button>
        </div>

        <!-- Approval chain preview -->
        <div *ngIf="chain" class="chain" [ngClass]="chain.canRequestStamp ? 'is-good' : 'is-bad'">
          <div style="font-weight:500;margin-bottom:6px">
            {{ chain.canRequestStamp
                ? 'This person can raise a stamp request.'
                : 'This person cannot raise a stamp request yet.' }}
          </div>
          <div class="detail-grid" style="margin:0">
            <div class="label">Reviewed by</div>
            <div class="value">{{ chain.reviewer ? (chain.reviewer.displayName || chain.reviewer.username) : '—' }}</div>
            <div class="label">Approved by</div>
            <div class="value">{{ chain.approver ? (chain.approver.displayName || chain.approver.username) : '—' }}</div>
          </div>
          <ul *ngIf="chain.blockers.length" style="margin:8px 0 0;padding-left:20px">
            <li *ngFor="let b of chain.blockers">{{ b }}</li>
          </ul>
          <button mat-button (click)="chain = null" style="margin-top:4px">Close</button>
        </div>

        <!-- Place a person -->
        <div *ngIf="auth.has('user:update') && unit.isActive" style="margin-top:16px;border-top:1px solid rgba(0,0,0,0.12);padding-top:16px">
          <div style="font-weight:500;margin-bottom:8px">Place a person in this unit</div>
          <div class="inline-actions" style="flex-wrap:wrap">
            <mat-form-field appearance="outline" style="width:280px">
              <mat-label>Person</mat-label>
              <mat-select [(ngModel)]="place.userId">
                <mat-option *ngFor="let u of placeable()" [value]="u.id">
                  {{ u.displayName || u.username }}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:280px">
              <mat-label>Line manager (reviews their requests)</mat-label>
              <mat-select [(ngModel)]="place.managerId">
                <mat-option value="">— none —</mat-option>
                <mat-option *ngFor="let u of activeUsers" [value]="u.id">
                  {{ u.displayName || u.username }}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-raised-button color="primary" [disabled]="!place.userId || working" (click)="placePerson()">
              Place
            </button>
          </div>
          <p class="muted" style="margin:8px 0 0">
            The line manager must be someone other than the head, or four eyes cannot be
            satisfied and the request will have nowhere to go.
          </p>
        </div>
      </mat-card-content></mat-card>

      <!-- Sub-units -->
      <mat-card style="margin-bottom:16px" *ngIf="unit.children.length"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Sub-units</h3>
        <div *ngFor="let c of unit.children" class="member">
          <span style="flex:1 1 auto">
            <a [routerLink]="['/org-units', c.id]" style="font-weight:500">{{ c.name }}</a>
            <span class="badge" [ngClass]="typeClass(c.unitType)" style="margin-left:8px">{{ label(c.unitType) }}</span>
          </span>
        </div>
      </mat-card-content></mat-card>

      <!-- Rename, move, deactivate -->
      <mat-card *ngIf="auth.has('orgunit:update')"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Change this unit</h3>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="edit.name" maxlength="120">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Code shown on the stamp</mat-label>
            <input matInput [(ngModel)]="edit.code" maxlength="16">
          </mat-form-field>
          <mat-form-field appearance="outline" *ngIf="unit.unitType !== 'ORGANISATION'" style="grid-column:1/3">
            <mat-label>Sits under</mat-label>
            <mat-select [(ngModel)]="edit.parentId">
              <mat-option *ngFor="let p of eligibleParents" [value]="p.id">
                {{ p.name }} · {{ label(p.unitType) }}
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="inline-actions">
          <button mat-raised-button color="primary" [disabled]="!dirty() || working" (click)="save()">
            {{ working ? 'Saving…' : 'Save changes' }}
          </button>
          <span class="spacer" style="flex:1 1 auto"></span>
          <button *ngIf="unit.isActive && !confirmingDeactivate" mat-button style="color:#c62828"
                  (click)="confirmingDeactivate = true">Deactivate unit</button>
        </div>

        <div *ngIf="confirmingDeactivate" class="chain is-bad" style="margin-top:12px">
          <div style="font-weight:500;margin-bottom:6px">Deactivate {{ unit.name }}?</div>
          <p class="muted" style="margin:0 0 8px">
            A unit is never deleted — it is evidence of who released past stamps. Deactivating
            hides it from the chart and stops new requests. It is refused while the unit still
            holds people or live sub-units; move those first.
          </p>
          <div class="inline-actions">
            <button mat-raised-button style="background:#c62828;color:#fff" [disabled]="working" (click)="deactivate()">
              Deactivate
            </button>
            <button mat-button (click)="confirmingDeactivate = false">Keep it</button>
          </div>
        </div>

        <p class="muted" style="margin:12px 0 0" *ngIf="unit.unitType !== 'ORGANISATION'">
          Moving a unit needs authority over where it is going as well as where it is now.
        </p>
      </mat-card-content></mat-card>
    </div>

    <div *ngIf="loading" style="text-align:center;padding:60px">
      <mat-spinner diameter="36" style="margin:auto"></mat-spinner>
    </div>
  `,
  styles: [`
    .member { display: flex; align-items: center; gap: 12px; padding: 10px 0;
      border-bottom: 1px solid rgba(0,0,0,0.08); }
    .member:last-of-type { border-bottom: 0; }
    .chain { padding: 14px 16px; border-radius: 4px; margin-top: 12px; font-size: 14px; }
    .chain.is-good { background: #e8f5e9; color: #2e7d32; }
    .chain.is-bad { background: #fff8e1; color: #8d6e00; }
    .b-org  { background: #ede7f6; color: #4527a0; }
    .b-div  { background: #e3f2fd; color: #1565c0; }
    .b-dept { background: #e0f2f1; color: #00695c; }
  `],
})
export class OrgUnitDetailComponent implements OnInit {
  unit?: OrgUnitDetail;
  activeUsers: User[] = [];
  eligibleParents: Array<{ id: string; name: string; unitType: OrgUnitType }> = [];
  chain: ApprovalChain | null = null;

  loading = true;
  working = false;
  confirmingDeactivate = false;

  headChoice = '';
  edit = { name: '', code: '', parentId: '' };
  place: { userId: string; managerId: string } = { userId: '', managerId: '' };

  constructor(
    private readonly api: ApiService,
    public readonly auth: AuthService,
    private readonly notify: NotifyService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) this.load(id);
    });
    this.api.listUsers(200, 0, true).subscribe({
      next: (page) => { this.activeUsers = page.items ?? []; },
      error: () => { /* the screen still works without the picker */ },
    });
  }

  private load(id: string) {
    this.loading = true;
    this.chain = null;
    this.confirmingDeactivate = false;
    this.api.getOrgUnit(id).subscribe({
      next: (unit) => {
        this.unit = unit;
        this.headChoice = unit.headUserId ?? '';
        this.edit = { name: unit.name, code: unit.code ?? '', parentId: unit.parentId ?? '' };
        this.loading = false;
        this.loadParents(unit);
      },
      error: (err) => {
        this.loading = false;
        this.notify.error(this.notify.fromError(err, 'Could not load the unit'));
        this.router.navigate(['/org-units']);
      },
    });
  }

  /** A parent must outrank the unit, and a unit can never move under itself. */
  private loadParents(unit: OrgUnitDetail) {
    if (unit.unitType === 'ORGANISATION') { this.eligibleParents = []; return; }
    const wanted: OrgUnitType[] = unit.unitType === 'DIVISION' ? ['ORGANISATION'] : ['ORGANISATION', 'DIVISION'];
    this.api.listOrgUnits({ entityId: unit.entityId }).subscribe({
      next: (res) => {
        this.eligibleParents = (res.data ?? [])
          .filter((u) => u.isActive && u.id !== unit.id && wanted.includes(u.unitType))
          .map((u) => ({ id: u.id, name: u.name, unitType: u.unitType }));
      },
      error: () => { this.eligibleParents = []; },
    });
  }

  /** The API returns ancestry nearest-parent-first; a breadcrumb reads root-first. */
  breadcrumb(): OrgUnitRef[] {
    return [...(this.unit?.ancestry ?? [])].reverse();
  }

  nameOf(userId: string): string {
    const u = this.activeUsers.find((x) => x.id === userId);
    return u ? (u.displayName || u.username) : 'someone outside this unit';
  }

  /** Anyone not already in this unit. */
  placeable(): User[] {
    const here = new Set((this.unit?.members ?? []).map((m) => m.id));
    return this.activeUsers.filter((u) => !here.has(u.id));
  }

  dirty(): boolean {
    if (!this.unit) return false;
    return this.edit.name.trim() !== this.unit.name
      || this.edit.code.trim() !== (this.unit.code ?? '')
      || (this.unit.unitType !== 'ORGANISATION' && this.edit.parentId !== (this.unit.parentId ?? ''));
  }

  save() {
    if (!this.unit) return;
    const body: { name?: string; code?: string; parentId?: string } = {};
    if (this.edit.name.trim() !== this.unit.name) body.name = this.edit.name.trim();
    if (this.edit.code.trim() !== (this.unit.code ?? '')) body.code = this.edit.code.trim();
    if (this.unit.unitType !== 'ORGANISATION' && this.edit.parentId !== (this.unit.parentId ?? '')) {
      body.parentId = this.edit.parentId;
    }

    this.working = true;
    this.api.updateOrgUnit(this.unit.id, body).subscribe({
      next: () => {
        this.working = false;
        this.notify.success('Unit updated');
        this.load(this.unit!.id);
      },
      error: (err) => {
        this.working = false;
        this.notify.error(this.notify.fromError(err, 'Could not update the unit'));
      },
    });
  }

  saveHead() {
    if (!this.unit) return;
    this.working = true;
    this.api.setOrgUnitHead(this.unit.id, this.headChoice || null).subscribe({
      next: () => {
        this.working = false;
        this.notify.success(this.headChoice ? 'Head appointed' : 'The seat is now vacant');
        this.load(this.unit!.id);
      },
      error: (err) => {
        this.working = false;
        this.notify.error(this.notify.fromError(err, 'Could not change the head'));
      },
    });
  }

  placePerson() {
    if (!this.unit || !this.place.userId) return;
    this.working = true;
    this.api.setUserPlacement(this.place.userId, {
      orgUnitId: this.unit.id,
      managerId: this.place.managerId || null,
    }).subscribe({
      next: () => {
        this.working = false;
        this.notify.success('Person placed in this unit');
        this.place = { userId: '', managerId: '' };
        this.load(this.unit!.id);
      },
      error: (err) => {
        this.working = false;
        this.notify.error(this.notify.fromError(err, 'Could not place the person'));
      },
    });
  }

  checkChain(userId: string) {
    this.api.approvalChain(userId).subscribe({
      next: (chain) => { this.chain = chain; },
      error: (err) => this.notify.error(this.notify.fromError(err, 'Could not read the approval chain')),
    });
  }

  deactivate() {
    if (!this.unit) return;
    this.working = true;
    this.api.deactivateOrgUnit(this.unit.id).subscribe({
      next: () => {
        this.working = false;
        this.notify.success(`${this.unit!.name} deactivated`);
        this.router.navigate(['/org-units']);
      },
      error: (err) => {
        this.working = false;
        this.confirmingDeactivate = false;
        this.notify.error(this.notify.fromError(err, 'Could not deactivate the unit'));
      },
    });
  }

  label(t: OrgUnitType): string {
    return t === 'ORGANISATION' ? 'Organisation' : t === 'DIVISION' ? 'Division' : 'Department';
  }

  typeClass(t: OrgUnitType): string {
    return t === 'ORGANISATION' ? 'b-org' : t === 'DIVISION' ? 'b-div' : 'b-dept';
  }
}
