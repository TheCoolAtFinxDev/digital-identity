import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';

const TOKEN_KEY = 'di_access_token';

interface JwtPayload { sub?: string; userId?: string; username?: string; exp?: number; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Effective GLOBAL permission codes for the current user, loaded from /v1/auth/me. */
  private permissions = new Set<string>();
  username$ = new BehaviorSubject<string | null>(null);
  private loaded = false;

  constructor(private http: HttpClient) {
    // Restore identity from a persisted token on app boot
    const p = this.decode();
    if (p) this.username$.next(p.username ?? p.sub ?? null);
  }

  isLoggedIn(): boolean {
    const p = this.decode();
    if (!p) return false;
    if (p.exp && p.exp * 1000 < Date.now()) { this.logout(); return false; }
    return true;
  }

  getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    const p = this.decode();
    this.username$.next(p?.username ?? p?.sub ?? null);
    this.loaded = false;
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.permissions.clear();
    this.loaded = false;
    this.username$.next(null);
  }

  userId(): string | null { return this.decode()?.userId ?? null; }

  /** Load effective permissions once per session. Safe to call repeatedly. */
  loadPermissions(): void {
    if (this.loaded || !this.isLoggedIn()) return;
    this.loaded = true;
    this.http.get<{ permissions: string[]; username: string | null }>('/v1/auth/me').subscribe({
      next: (me) => {
        this.permissions = new Set(me.permissions ?? []);
        if (me.username) this.username$.next(me.username);
      },
      error: () => { this.loaded = false; },
    });
  }

  /** True if the user holds the given GLOBAL permission. Server still enforces per-request. */
  has(permission: string): boolean { return this.permissions.has(permission); }

  /** True if the user holds any of the given permissions. */
  hasAny(...permissions: string[]): boolean { return permissions.some((p) => this.permissions.has(p)); }

  private decode(): JwtPayload | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const part = token.split('.')[1];
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json) as JwtPayload;
    } catch { return null; }
  }
}
