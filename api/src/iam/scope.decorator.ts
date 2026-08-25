import { SetMetadata } from '@nestjs/common';

export const SCOPE_KEY = 'permissionScope';

/**
 * Where the thing a route acts on lives.
 *
 * A route declares this; the guard never infers it. Inferring the target from a
 * URL shape works until it doesn't: two routes with `:id` in the same position
 * can point at completely different resources, and a guard that guesses wrong
 * either grants authority over the wrong unit or refuses the right one. Both are
 * security bugs, so the declaration is mandatory and its absence fails at boot
 * rather than in production — see ScopeCoverageService.
 *
 * `from` says where in the request the identifier is; `name` is the parameter or
 * body field holding it. Anything other than ORG_UNIT and ENTITY is a resource
 * the resolver walks back to its owning entity or unit.
 */
export type ScopeDeclaration =
  /** Organisation-wide by nature — a scoped grant can never satisfy it. */
  | { target: 'GLOBAL' }
  | { target: 'ORG_UNIT'; from: 'param' | 'body'; name: string }
  | { target: 'ENTITY'; from: 'param' | 'body'; name: string }
  /** A user: their unit, their unit's ancestors, and their PERSON entity. */
  | { target: 'USER'; from: 'param' | 'body'; name: string }
  | { target: 'VERIFICATION_CASE'; from: 'param'; name: string }
  | { target: 'CERT_REQUEST'; from: 'param'; name: string }
  /** Addressed by serial, not id — the certificate routes use the serial. */
  | { target: 'CERTIFICATE'; from: 'param'; name: string }
  | { target: 'RELATIONSHIP'; from: 'param'; name: string }
  | { target: 'STAMP'; from: 'param'; name: string };

/**
 * Declare what a permission-guarded route acts on, so a narrowly-scoped role
 * assignment can satisfy it.
 *
 *   @RequirePermission('orgunit:update')
 *   @ScopedTo({ target: 'ORG_UNIT', from: 'param', name: 'id' })
 *
 * A route that moves something between two places names both, and the caller
 * must hold authority over EVERY one that the request actually populates:
 *
 *   @ScopedTo([
 *     { target: 'ORG_UNIT', from: 'param', name: 'id' },        // where it is
 *     { target: 'ORG_UNIT', from: 'body',  name: 'parentId' },  // where it goes
 *   ])
 *
 * A declaration whose field is absent from the request describes nothing and is
 * skipped — a rename carries no parentId, so it only needs authority over the
 * unit itself. A declaration whose field IS present but names something that
 * cannot be found refuses the request rather than skipping it.
 */
export const ScopedTo = (declaration: ScopeDeclaration | ScopeDeclaration[]) =>
  SetMetadata(SCOPE_KEY, declaration);

/**
 * Mark a route as not narrowable: the permission is only ever held organisation-
 * wide. Use it for routes with no single resource behind them (lists, the
 * permission catalogue) and for authority that must not be delegated per unit
 * (creating users, minting service accounts).
 *
 * Reads of a single resource are deliberately NOT global — see ScopedTo. Read
 * isolation between units is out of scope for the pilot, so list endpoints stay
 * organisation-wide; that is a decision about filtering, not about authority.
 */
export const GlobalScope = () => ScopedTo({ target: 'GLOBAL' });
