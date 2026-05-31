import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard] },

  // Entities
  { path: 'entities', loadComponent: () => import('./pages/entities/list/entities-list.component').then(m => m.EntitiesListComponent), canActivate: [authGuard] },
  { path: 'entities/new', loadComponent: () => import('./pages/entities/new/create-entity.component').then(m => m.CreateEntityComponent), canActivate: [authGuard] },
  { path: 'entities/:id', loadComponent: () => import('./pages/entities/detail/entity-detail.component').then(m => m.EntityDetailComponent), canActivate: [authGuard] },

  // Verification Cases
  { path: 'verification-cases', loadComponent: () => import('./pages/verification-cases/list/cases-list.component').then(m => m.CasesListComponent), canActivate: [authGuard] },
  { path: 'verification-cases/new', loadComponent: () => import('./pages/verification-cases/new/create-case.component').then(m => m.CreateCaseComponent), canActivate: [authGuard] },
  { path: 'verification-cases/:id', loadComponent: () => import('./pages/verification-cases/detail/case-detail.component').then(m => m.CaseDetailComponent), canActivate: [authGuard] },

  // Relationships
  { path: 'relationships', loadComponent: () => import('./pages/relationships/relationships.component').then(m => m.RelationshipsComponent), canActivate: [authGuard] },

  // Certificate Requests
  { path: 'requests', loadComponent: () => import('./pages/requests/list/requests-list.component').then(m => m.RequestsListComponent), canActivate: [authGuard] },
  { path: 'requests/new', loadComponent: () => import('./pages/requests/new/submit-csr.component').then(m => m.SubmitCsrComponent), canActivate: [authGuard] },
  { path: 'requests/:id', loadComponent: () => import('./pages/requests/detail/request-detail.component').then(m => m.RequestDetailComponent), canActivate: [authGuard] },

  // Users
  { path: 'users', loadComponent: () => import('./pages/users/list/users-list.component').then(m => m.UsersListComponent), canActivate: [authGuard] },
  { path: 'users/new', loadComponent: () => import('./pages/users/new/create-user.component').then(m => m.CreateUserComponent), canActivate: [authGuard] },
  { path: 'users/:id', loadComponent: () => import('./pages/users/detail/user-detail.component').then(m => m.UserDetailComponent), canActivate: [authGuard] },

  // Roles & Permissions
  { path: 'roles', loadComponent: () => import('./pages/roles/roles.component').then(m => m.RolesComponent), canActivate: [authGuard] },

  // Objects (Phase 1 legacy)
  { path: 'objects', loadComponent: () => import('./pages/objects/list/objects-list.component').then(m => m.ObjectsListComponent), canActivate: [authGuard] },
  { path: 'objects/new', loadComponent: () => import('./pages/objects/new/create-object.component').then(m => m.CreateObjectComponent), canActivate: [authGuard] },
  { path: 'objects/:id', loadComponent: () => import('./pages/objects/detail/object-detail.component').then(m => m.ObjectDetailComponent), canActivate: [authGuard] },

  // Audit + Verify
  { path: 'audit', loadComponent: () => import('./pages/audit/audit-log.component').then(m => m.AuditLogComponent), canActivate: [authGuard] },
  { path: 'verify', loadComponent: () => import('./pages/verify/verify.component').then(m => m.VerifyComponent) },

  { path: '**', redirectTo: '/dashboard' },
];
