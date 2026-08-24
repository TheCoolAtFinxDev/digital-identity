import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

/**
 * Badge for the staff-side statuses, reusing the palette already defined in
 * styles.css so a staff screen and an operations screen read the same.
 */
@Component({
  selector: 'staff-badge',
  standalone: true,
  imports: [NgClass],
  template: `<span class="badge" [ngClass]="cls()">{{ label() }}</span>`,
})
export class StaffBadgeComponent {
  @Input() status = '';

  label(): string {
    switch (this.status) {
      case 'AWAITING_SIGNATURE': return 'Awaiting signature';
      case 'AWAITING_REVIEW': return 'Awaiting review';
      case 'AWAITING_APPROVAL': return 'Awaiting approval';
      case 'STAMPED': return 'Stamped';
      case 'SIGNED': return 'Signed';
      case 'DECLINED': return 'Declined';
      case 'REJECTED': return 'Rejected';
      case 'SUPERSEDED': return 'Superseded';
      case 'RECALLED': return 'Recalled';
      case 'WITHDRAWN': return 'Withdrawn';
      case 'DRAFT': return 'Draft';
      default: return this.status;
    }
  }

  cls(): string {
    switch (this.status) {
      case 'AWAITING_SIGNATURE': return 'b-pending';
      case 'AWAITING_REVIEW':
      case 'AWAITING_APPROVAL': return 'b-review';
      case 'STAMPED':
      case 'SIGNED': return 'b-approved';
      case 'DECLINED':
      case 'REJECTED': return 'b-rejected';
      case 'RECALLED':
      case 'WITHDRAWN': return 'b-withdrawn';
      case 'DRAFT': return 'b-draft';
      case 'SUPERSEDED': return 'b-neutral';
      default: return 'b-neutral';
    }
  }
}
