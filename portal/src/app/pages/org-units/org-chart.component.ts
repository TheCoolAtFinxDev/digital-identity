import { Component, OnInit } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ApiService, Entity, OrgUnitNode, OrgUnitType } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';

/** One tree node flattened for display, carrying how deep it sits. */
interface Row {
  unit: OrgUnitNode;
  depth: number;
  /** True for the last child at its level — draws the corner of the tree line. */
  last: boolean;
}

@Component({
  selector: 'app-org-chart',
  standalone: true,
  imports: [
    NgIf, NgFor, NgClass, FormsModule, MatButtonModule, MatCardModule, MatCheckboxModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule,
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Organisation chart</h1>
          <div class="muted" style="margin-top:4px">
            Departments release stamps. Who heads a unit decides who can approve one.
          </div>
        </div>
        <button *ngIf="auth.has('orgunit:create') && organisations.length"
                mat-raised-button color="primary" (click)="toggleCreate()">
          {{ showCreate ? 'Cancel' : '+ Add unit' }}
        </button>
      </div>

      <!-- Organisation picker -->
      <div class="inline-actions" style="margin-bottom:16px">
        <mat-form-field appearance="outline" style="width:320px">
          <mat-label>Organisation</mat-label>
          <mat-select [(ngModel)]="entityId" (ngModelChange)="load()">
            <mat-option *ngFor="let e of organisations" [value]="e.id">{{ e.name }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-checkbox [(ngModel)]="includeInactive" (ngModelChange)="load()">Show deactivated units</mat-checkbox>
      </div>

      <!-- No organisations at all -->
      <mat-card *ngIf="!loadingEntities && !organisations.length">
        <mat-card-content style="padding-top:16px">
          <h3 style="margin-top:0">No organisation to chart yet</h3>
          <p class="muted" style="margin:0">
            An org chart hangs off a verified ORGANISATION entity. Create one under
            Entities first, then come back and add its root unit.
          </p>
        </mat-card-content>
      </mat-card>

      <!-- Create form -->
      <mat-card *ngIf="showCreate" style="margin-bottom:16px"><mat-card-content style="padding-top:16px">
        <h3 style="margin-top:0">Add a unit</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
          <mat-form-field appearance="outline">
            <mat-label>Type</mat-label>
            <mat-select [(ngModel)]="form.unitType" (ngModelChange)="onTypeChange()">
              <mat-option value="ORGANISATION" [disabled]="hasRoot">Organisation (root)</mat-option>
              <mat-option value="DIVISION">Division</mat-option>
              <mat-option value="DEPARTMENT">Department</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" *ngIf="form.unitType !== 'ORGANISATION'">
            <mat-label>Sits under</mat-label>
            <mat-select [(ngModel)]="form.parentId">
              <mat-option *ngFor="let p of eligibleParents()" [value]="p.unit.id">
                {{ indent(p.depth) }}{{ p.unit.name }} · {{ label(p.unit.unitType) }}
              </mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="form.name" placeholder="Finance" maxlength="120">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Code shown on the stamp</mat-label>
            <input matInput [(ngModel)]="form.code" placeholder="FIN" maxlength="16">
          </mat-form-field>
        </div>
        <div class="inline-actions">
          <button mat-raised-button color="primary" [disabled]="!canCreate() || saving" (click)="create()">
            {{ saving ? 'Adding…' : 'Add unit' }}
          </button>
          <button mat-stroked-button (click)="showCreate = false">Cancel</button>
        </div>
        <p class="muted" style="margin-top:8px">
          {{ hasRoot
              ? 'A division sits under the root; a department sits under a division.'
              : 'Start with the root unit — it is the organisation itself, and everything else hangs off it.' }}
        </p>
      </mat-card-content></mat-card>

      <div *ngIf="loading" style="text-align:center;padding:40px">
        <mat-spinner diameter="36" style="margin:auto"></mat-spinner>
      </div>

      <!-- Empty chart -->
      <mat-card *ngIf="!loading && entityId && !rows.length">
        <mat-card-content style="padding-top:16px">
          <h3 style="margin-top:0">This organisation has no chart yet</h3>
          <p class="muted" style="margin:0">
            Add the root unit first. Until a person sits in a department with an active
            head, no stamp request has anywhere to go.
          </p>
        </mat-card-content>
      </mat-card>

      <!-- The chart -->
      <div class="chart" *ngIf="!loading && rows.length">
        <div *ngFor="let r of rows" class="node" [ngClass]="{ 'is-inactive': !r.unit.isActive }"
             (click)="open(r.unit)" tabindex="0" (keydown.enter)="open(r.unit)">
          <span class="rail" [style.width.px]="r.depth * 26"></span>
          <span class="elbow" *ngIf="r.depth">{{ r.last ? '└' : '├' }}</span>

          <span class="body">
            <span class="line1">
              <span class="name">{{ r.unit.name }}</span>
              <span class="badge" [ngClass]="typeClass(r.unit.unitType)">{{ label(r.unit.unitType) }}</span>
              <span class="badge b-neutral" *ngIf="r.unit.code">{{ r.unit.code }}</span>
              <span class="badge b-inactive" *ngIf="!r.unit.isActive">Deactivated</span>
            </span>
            <span class="line2 muted">
              <ng-container *ngIf="!r.unit.headVacant">
                Headed by {{ r.unit.head?.displayName || r.unit.head?.username }}
              </ng-container>
              <span *ngIf="r.unit.headVacant" style="color:#f57f17;font-weight:500">
                {{ r.unit.headUserId ? 'Head deactivated — seat vacant' : 'No head appointed' }}
              </span>
              <ng-container *ngIf="r.unit.memberCount">
                &nbsp;·&nbsp;{{ r.unit.memberCount }} {{ r.unit.memberCount === 1 ? 'person' : 'people' }}
              </ng-container>
            </span>
          </span>
        </div>
      </div>

      <p class="muted" *ngIf="!loading && vacancies() as v" style="margin-top:16px">
        <ng-container *ngIf="v">
          {{ v }} {{ v === 1 ? 'unit has' : 'units have' }} no active head. A department
          cannot release its stamp until someone can approve it.
        </ng-container>
      </p>
    </div>
  `,
  styles: [`
    .chart { background: #fff; border-radius: 4px; overflow: hidden;
      box-shadow: 0 2px 1px -1px rgba(0,0,0,.2), 0 1px 1px 0 rgba(0,0,0,.14), 0 1px 3px 0 rgba(0,0,0,.12); }
    .node { display: flex; align-items: flex-start; gap: 6px; padding: 12px 16px; cursor: pointer;
      border-bottom: 1px solid rgba(0,0,0,0.08); border-left: 3px solid transparent; }
    .node:hover { background: #f5f5f5; border-left-color: #3f51b5; }
    .node:focus-visible { outline: 2px solid #3f51b5; outline-offset: -2px; }
    .node:last-child { border-bottom: 0; }
    .node.is-inactive { opacity: 0.55; }
    .rail { flex: 0 0 auto; }
    .elbow { color: rgba(0,0,0,0.28); font-family: monospace; line-height: 20px; }
    .body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .name { font-weight: 500; }
    .line2 { font-size: 12px; }
    .b-org  { background: #ede7f6; color: #4527a0; }
    .b-div  { background: #e3f2fd; color: #1565c0; }
    .b-dept { background: #e0f2f1; color: #00695c; }
  `],
})
export class OrgChartComponent implements OnInit {
  organisations: Entity[] = [];
  entityId = '';
  rows: Row[] = [];
  includeInactive = false;
  loading = false;
  loadingEntities = true;
  saving = false;
  showCreate = false;
  hasRoot = false;

  form: { unitType: OrgUnitType; name: string; code: string; parentId: string } = {
    unitType: 'DEPARTMENT', name: '', code: '', parentId: '',
  };

  constructor(
    private readonly api: ApiService,
    public readonly auth: AuthService,
    private readonly notify: NotifyService,
    private readonly router: Router,
  ) {}

  ngOnInit() {
    // Only an ORGANISATION entity has an internal structure — a person has no
    // departments, and the API refuses one with a 422.
    this.api.listEntities(1, 100).subscribe({
      next: (page) => {
        this.organisations = page.data.filter((e) => e.entityType === 'ORGANISATION');
        this.loadingEntities = false;
        if (this.organisations.length) {
          this.entityId = this.organisations[0].id;
          this.load();
        }
      },
      error: (err) => {
        this.loadingEntities = false;
        this.notify.error(this.notify.fromError(err, 'Could not load organisations'));
      },
    });
  }

  load() {
    if (!this.entityId) return;
    this.loading = true;
    this.api.listOrgUnits({ entityId: this.entityId, tree: true, includeInactive: this.includeInactive })
      .subscribe({
        next: (res) => {
          this.rows = this.flatten(res.data ?? [], 0);
          this.hasRoot = this.rows.some((r) => r.unit.unitType === 'ORGANISATION' && r.unit.isActive);
          this.form.unitType = this.hasRoot ? 'DEPARTMENT' : 'ORGANISATION';
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.rows = [];
          this.notify.error(this.notify.fromError(err, 'Could not load the org chart'));
        },
      });
  }

  /** Depth-first, so a child always renders directly beneath its parent. */
  private flatten(nodes: OrgUnitNode[], depth: number): Row[] {
    const out: Row[] = [];
    nodes.forEach((unit, i) => {
      out.push({ unit, depth, last: i === nodes.length - 1 });
      if (unit.children?.length) out.push(...this.flatten(unit.children, depth + 1));
    });
    return out;
  }

  /** A parent must outrank its child: division under root, department under division. */
  eligibleParents(): Row[] {
    const wanted: OrgUnitType[] = this.form.unitType === 'DIVISION' ? ['ORGANISATION'] : ['ORGANISATION', 'DIVISION'];
    return this.rows.filter((r) => r.unit.isActive && wanted.includes(r.unit.unitType));
  }

  onTypeChange() {
    const eligible = this.eligibleParents();
    if (!eligible.some((r) => r.unit.id === this.form.parentId)) {
      this.form.parentId = eligible.length === 1 ? eligible[0].unit.id : '';
    }
  }

  toggleCreate() {
    this.showCreate = !this.showCreate;
    if (this.showCreate) {
      this.form = { unitType: this.hasRoot ? 'DEPARTMENT' : 'ORGANISATION', name: '', code: '', parentId: '' };
      this.onTypeChange();
    }
  }

  canCreate(): boolean {
    if (this.form.name.trim().length < 2) return false;
    return this.form.unitType === 'ORGANISATION' || !!this.form.parentId;
  }

  create() {
    this.saving = true;
    this.api.createOrgUnit({
      entityId: this.entityId,
      unitType: this.form.unitType,
      name: this.form.name.trim(),
      ...(this.form.code.trim() ? { code: this.form.code.trim() } : {}),
      ...(this.form.unitType === 'ORGANISATION' ? {} : { parentId: this.form.parentId }),
    }).subscribe({
      next: (unit) => {
        this.saving = false;
        this.showCreate = false;
        this.notify.success(`${unit.name} added to the chart`);
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.notify.error(this.notify.fromError(err, 'Could not add the unit'));
      },
    });
  }

  open(unit: OrgUnitNode) { this.router.navigate(['/org-units', unit.id]); }

  vacancies(): number { return this.rows.filter((r) => r.unit.isActive && r.unit.headVacant).length; }

  indent(depth: number): string { return '  '.repeat(depth); }

  label(t: OrgUnitType): string {
    return t === 'ORGANISATION' ? 'Organisation' : t === 'DIVISION' ? 'Division' : 'Department';
  }

  typeClass(t: OrgUnitType): string {
    return t === 'ORGANISATION' ? 'b-org' : t === 'DIVISION' ? 'b-div' : 'b-dept';
  }
}
