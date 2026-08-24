import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { NgIf, NgFor, AsyncPipe } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';

interface NavItem { label: string; link: string; perms?: string[]; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIf, NgFor, AsyncPipe, MatToolbarModule, MatButtonModule, MatMenuModule],
  template: `
    <mat-toolbar color="primary" *ngIf="auth.isLoggedIn()" style="position:sticky;top:0;z-index:100;gap:2px;flex-wrap:wrap">
      <a routerLink="/dashboard" style="color:white;text-decoration:none;font-weight:700;letter-spacing:0.5px;font-size:16px;margin-right:8px">
        Digital Identity
      </a>
      <a *ngFor="let n of visibleNav()" mat-button [routerLink]="n.link" routerLinkActive="active-nav">{{ n.label }}</a>
      <span class="spacer"></span>
      <span *ngIf="auth.username$ | async as u" style="font-size:13px;opacity:0.85;margin-right:8px">{{ u }}</span>
      <button mat-button (click)="logout()">Logout</button>
    </mat-toolbar>
    <router-outlet />
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    a.active-nav { background: rgba(255,255,255,0.18); border-radius: 4px; }
    mat-toolbar a[mat-button] { font-size: 13px; min-width: 0; padding: 0 10px; }
  `]
})
export class AppComponent implements OnInit {
  nav: NavItem[] = [
    { label: 'Dashboard', link: '/dashboard' },
    // Staff daily operations. Gated on stamp:read for now; once people are on
    // the org chart this should key off having a unit rather than a permission.
    { label: 'My documents', link: '/staff/documents', perms: ['stamp:read'] },
    { label: 'Awaiting me', link: '/staff/awaiting', perms: ['stamp:read'] },
    { label: 'Entities', link: '/entities', perms: ['entity:read'] },
    { label: 'Cases', link: '/verification-cases', perms: ['entity:read'] },
    { label: 'Relationships', link: '/relationships', perms: ['relationship:read'] },
    { label: 'Certificates', link: '/requests', perms: ['cert:read', 'cert:request'] },
    { label: 'Users', link: '/users', perms: ['user:read'] },
    { label: 'Roles', link: '/roles', perms: ['user:read', 'iso:manage'] },
    { label: 'Audit', link: '/audit', perms: ['audit:read'] },
    { label: 'Verify', link: '/verify' },
  ];

  constructor(public auth: AuthService, private router: Router) {}

  ngOnInit() {
    // Load effective permissions whenever logged in (boot + after each navigation post-login)
    if (this.auth.isLoggedIn()) this.auth.loadPermissions();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      if (this.auth.isLoggedIn()) this.auth.loadPermissions();
    });
  }

  visibleNav(): NavItem[] {
    return this.nav.filter((n) => !n.perms || this.auth.hasAny(...n.perms));
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
