import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

/** Renders a coloured badge for any entity/case/relationship/request status. */
@Component({
  selector: 'status-badge',
  standalone: true,
  imports: [NgClass],
  template: `<span class="badge" [ngClass]="cls()">{{ status }}</span>`,
})
export class StatusBadgeComponent {
  @Input() status = '';

  cls(): string {
    switch (this.status) {
      case 'DRAFT': return 'b-draft';
      case 'PENDING_VERIFICATION':
      case 'PENDING':
      case 'PENDING_APPROVAL':
      case 'SUBMITTED':
      case 'NEW': return 'b-pending';
      case 'UNDER_REVIEW': return 'b-review';
      case 'APPROVED':
      case 'ISSUED':
      case 'ACTIVE': return 'b-approved';
      case 'REJECTED': return 'b-rejected';
      case 'SUSPENDED': return 'b-suspended';
      case 'WITHDRAWN':
      case 'INACTIVE': return 'b-withdrawn';
      default: return 'b-neutral';
    }
  }
}
