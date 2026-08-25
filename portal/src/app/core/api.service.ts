import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface TokenResponse { accessToken: string; expiresIn: number; }
export interface MeResponse { userId: string | null; username: string | null; permissions: string[]; }

// ─── Certificates ───────────────────────────────────────────────────────────
export interface CertRequestSummary {
  id: string; status: string; profile: string;
  subject?: string | null; entityId?: string | null; createdAt: string;
  certificate?: { serial: string } | null;
}
export interface CertRequestPage { data: CertRequestSummary[]; total: number; page: number; limit: number; }
export interface Certificate {
  id: string; serial: string; subject: string; profile: string; issuer?: string | null;
  fingerprint?: string | null; validFrom: string; validTo: string; certPem: string;
  isRevoked?: boolean; revokedAt?: string | null; revokedBy?: string | null;
  hsmManaged?: boolean; hsmKeyLabel?: string | null; hsmKeyId?: string | null; createdAt: string;
}
export interface CertRequestDetail {
  id: string; status: string; profile: string;
  subject?: string | null; keyBits?: number | null; entityId?: string | null;
  createdAt: string; updatedAt: string;
  certificate?: Certificate | null;
}

// ─── Entities ─────────────────────────────────────────────────────────────────
export interface Entity {
  id: string; name: string; country: string; entityType: string; status: string;
  kycStatus: string; createdBy?: string | null; requestCount: number;
  createdAt: string; updatedAt: string;
}
export interface EntityPage { data: Entity[]; total: number; page: number; limit: number; }

export interface PersonProfile {
  id?: string; entityId?: string;
  firstName: string; middleName?: string | null; lastName: string;
  dateOfBirth: string; nationality: string; idType: string; idNumber: string;
  idIssuedBy?: string | null; idIssuedDate?: string | null; idExpiryDate?: string | null;
  taxNumber?: string | null; addressLine1: string; addressLine2?: string | null;
  city: string; region?: string | null; postalCode?: string | null; addressCountry: string;
}
export interface OrgProfile {
  id?: string; entityId?: string;
  legalName: string; tradingName?: string | null; registrationNumber: string;
  registrationDate?: string | null; registrationCountry: string; businessType: string;
  industrySector?: string | null; taxNumber?: string | null; vatNumber?: string | null;
  regAddressLine1: string; regAddressLine2?: string | null; regCity: string;
  regRegion?: string | null; regPostalCode?: string | null; regCountry: string;
  contactEmail?: string | null; contactPhone?: string | null; websiteUrl?: string | null;
}

// ─── Users / Roles / Permissions ────────────────────────────────────────────
export interface User {
  id: string; username: string; email: string; displayName?: string | null;
  isActive: boolean; createdBy?: string | null; createdAt: string; updatedAt: string;
}
export interface UserPage { items: User[]; total: number; limit: number; offset: number; }
export interface RoleAssignment {
  id: string; userId: string; roleId: string; scope: string; scopeId?: string | null;
  assignedBy: string; assignedAt: string; expiresAt?: string | null; isActive: boolean;
  role?: { id: string; code: string; name: string; description?: string | null };
}
// ── Organisational structure (S2 backend, WP-7.2 screens) ──
export type OrgUnitType = 'ORGANISATION' | 'DIVISION' | 'DEPARTMENT';

/** A person as the org-chart endpoints return them — never the full User record. */
export interface OrgPerson {
  id: string; username: string; displayName?: string | null; isActive?: boolean;
}
export interface OrgUnit {
  id: string; entityId: string; unitType: OrgUnitType;
  name: string; code?: string | null;
  parentId?: string | null; headUserId?: string | null;
  head?: OrgPerson | null;
  /** True when the seat is empty OR the appointed head has been deactivated. */
  headVacant: boolean;
  memberCount?: number; childCount?: number;
  isActive: boolean; createdAt: string;
}
/** Only present on the tree view — the flat list leaves it undefined. */
export interface OrgUnitNode extends OrgUnit { children?: OrgUnitNode[]; }
export interface OrgUnitRef { id: string; name: string; unitType: OrgUnitType; code?: string | null; }
export interface OrgUnitDetail extends OrgUnit {
  parent?: OrgUnitRef | null;
  children: OrgUnitRef[];
  members: Array<OrgPerson & { managerId?: string | null }>;
  /** Walked upward from the unit: nearest parent first, root last. Reverse it
   *  for a breadcrumb. */
  ancestry: OrgUnitRef[];
}
export interface ApprovalChain {
  userId: string;
  unit: OrgUnitRef | null;
  reviewer: OrgPerson | null;
  approver: OrgPerson | null;
  canRequestStamp: boolean;
  blockers: string[];
}

export interface Permission { id: string; code: string; name: string; description?: string | null; resource: string; action: string; }
export interface Role {
  id: string; code: string; name: string; description?: string | null; isSystem: boolean; createdAt: string;
  permissions?: { permission: Permission }[];
}

// ─── Verification Cases ─────────────────────────────────────────────────────
export interface CaseUserRef { id: string; username: string; displayName?: string | null; }
export interface VerificationCase {
  id: string; entityId: string; caseType: string; status: string; priority: string;
  createdById: string; reviewedById?: string | null; approvedById?: string | null; rejectedById?: string | null;
  rejectionReason?: string | null; reviewNotes?: string | null; dueDate?: string | null;
  submittedAt?: string | null; reviewedAt?: string | null; approvedAt?: string | null; rejectedAt?: string | null;
  createdAt: string; updatedAt: string;
  entity?: { id: string; name: string; entityType: string; status: string };
  createdBy?: CaseUserRef; reviewedBy?: CaseUserRef | null; approvedBy?: CaseUserRef | null; rejectedBy?: CaseUserRef | null;
  _count?: { evidence: number };
}
export interface CasePage { items: VerificationCase[]; total: number; limit: number; offset: number; }
export interface Evidence {
  id: string; caseId: string; documentType: string; fileName: string; fileSize: number;
  mimeType: string; sha256Hash: string; uploadedById: string; notes?: string | null; createdAt: string;
}

// ─── Relationships ────────────────────────────────────────────────────────────
export interface EntityRef { id: string; name: string; entityType: string; }
export interface Relationship {
  id: string; subjectEntityId: string; objectEntityId: string; relationshipType: string;
  ownershipPercent?: number | null; startDate: string; endDate?: string | null; status: string;
  notes?: string | null; createdById: string; createdAt: string; updatedAt: string;
  subjectEntity?: EntityRef; objectEntity?: EntityRef;
}
export interface RelationshipPage { items: Relationship[]; total: number; limit: number; offset: number; }

// ─── Objects (Phase 1 legacy) ─────────────────────────────────────────────────
export interface ObjectRecord {
  id: string; objectType: string; reference: string;
  entityId?: string | null; entityName?: string | null;
  metadata?: Record<string, unknown> | null; createdAt: string;
}
export interface ObjectPage { data: ObjectRecord[]; total: number; page: number; limit: number; }

// ─── Verify / Audit ───────────────────────────────────────────────────────────
export interface VerificationResponse {
  serial: string; valid: boolean; isExpired: boolean; isRevoked: boolean;
  identityType?: string | null; subject?: string | null; issuer?: string | null;
  validFrom?: string | null; validTo?: string | null;
  entity?: { id: string; name: string; country: string; kycStatus: string } | null;
}
export interface AuditEntry {
  id: string; event: string; requestId?: string | null;
  entityId?: string | null; userId?: string | null; detail?: unknown; createdAt: string;
}
export interface AuditPage { data: AuditEntry[]; total: number; page: number; limit: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly http: HttpClient) {}

  login(username: string, password: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>('/v1/auth/login', { username, password });
  }
  me(): Observable<MeResponse> { return this.http.get<MeResponse>('/v1/auth/me'); }

  // ── Cert Requests ──
  listRequests(page = 1, limit = 20, status?: string): Observable<CertRequestPage> {
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (status) params['status'] = status;
    return this.http.get<CertRequestPage>('/v1/cert-requests', { params });
  }
  getRequest(id: string): Observable<CertRequestDetail> {
    return this.http.get<CertRequestDetail>(`/v1/cert-requests/${id}`);
  }
  submitCsr(csrPem: string, profile: string, entityId?: string): Observable<CertRequestDetail> {
    const body: Record<string, string> = { csrPem, profile };
    if (entityId) body['entityId'] = entityId;
    return this.http.post<CertRequestDetail>('/v1/cert-requests', body);
  }
  issueRequest(id: string): Observable<Certificate> {
    return this.http.post<Certificate>(`/v1/cert-requests/${id}/issue`, {});
  }
  // Managed (HSM-escrow) issuance — CA generates the key in the HSM, no CSR supplied.
  issueManagedCertificate(entityId: string): Observable<Certificate> {
    return this.http.post<Certificate>('/v1/cert-requests/managed', { entityId });
  }
  getCertificate(serial: string): Observable<Certificate> {
    return this.http.get<Certificate>(`/v1/certificates/${serial}`);
  }
  revokeCertificate(serial: string, revokedBy?: string): Observable<Certificate> {
    return this.http.patch<Certificate>(`/v1/certificates/${serial}/revoke`, revokedBy ? { revokedBy } : {});
  }

  // ── Entities ──
  listEntities(page = 1, limit = 20, kycStatus?: string): Observable<EntityPage> {
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (kycStatus) params['kycStatus'] = kycStatus;
    return this.http.get<EntityPage>('/v1/entities', { params });
  }
  getEntity(id: string): Observable<Entity> { return this.http.get<Entity>(`/v1/entities/${id}`); }
  createEntity(name: string, country: string, entityType: string): Observable<Entity> {
    return this.http.post<Entity>('/v1/entities', { name, country, entityType });
  }
  updateKycStatus(id: string, kycStatus: string): Observable<Entity> {
    return this.http.patch<Entity>(`/v1/entities/${id}/kyc-status`, { kycStatus });
  }
  getPersonProfile(id: string): Observable<PersonProfile> {
    return this.http.get<PersonProfile>(`/v1/entities/${id}/person-profile`);
  }
  upsertPersonProfile(id: string, p: PersonProfile): Observable<PersonProfile> {
    return this.http.post<PersonProfile>(`/v1/entities/${id}/person-profile`, p);
  }
  getOrgProfile(id: string): Observable<OrgProfile> {
    return this.http.get<OrgProfile>(`/v1/entities/${id}/org-profile`);
  }
  upsertOrgProfile(id: string, p: OrgProfile): Observable<OrgProfile> {
    return this.http.post<OrgProfile>(`/v1/entities/${id}/org-profile`, p);
  }

  // ── Users ──
  listUsers(limit = 50, offset = 0, activeOnly?: boolean): Observable<UserPage> {
    const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
    if (activeOnly) params['activeOnly'] = 'true';
    return this.http.get<UserPage>('/v1/users', { params });
  }
  getUser(id: string): Observable<User> { return this.http.get<User>(`/v1/users/${id}`); }
  createUser(body: { username: string; email: string; password: string; displayName?: string }): Observable<User> {
    return this.http.post<User>('/v1/users', body);
  }
  updateUser(id: string, body: { email?: string; displayName?: string }): Observable<User> {
    return this.http.patch<User>(`/v1/users/${id}`, body);
  }
  deactivateUser(id: string): Observable<User> {
    return this.http.patch<User>(`/v1/users/${id}/deactivate`, {});
  }
  changePassword(id: string, newPassword: string): Observable<void> {
    return this.http.patch<void>(`/v1/users/${id}/password`, { newPassword });
  }
  getUserRoles(id: string): Observable<RoleAssignment[]> {
    return this.http.get<RoleAssignment[]>(`/v1/users/${id}/roles`);
  }
  assignRole(id: string, body: { roleId: string; scope?: string; scopeId?: string; expiresAt?: string }): Observable<RoleAssignment> {
    return this.http.post<RoleAssignment>(`/v1/users/${id}/roles`, body);
  }
  revokeRole(id: string, assignmentId: string): Observable<void> {
    return this.http.delete<void>(`/v1/users/${id}/roles/${assignmentId}`);
  }

  // ── Roles / Permissions ──
  listRoles(): Observable<Role[]> { return this.http.get<Role[]>('/v1/roles'); }
  getRole(id: string): Observable<Role> { return this.http.get<Role>(`/v1/roles/${id}`); }
  listPermissions(): Observable<Permission[]> { return this.http.get<Permission[]>('/v1/permissions'); }

  // ── Organisational structure ──
  listOrgUnits(opts: { entityId?: string; tree?: boolean; includeInactive?: boolean } = {}): Observable<{ data: OrgUnitNode[]; total?: number }> {
    const params: Record<string, string> = {};
    if (opts.entityId) params['entityId'] = opts.entityId;
    if (opts.tree) params['tree'] = 'true';
    if (opts.includeInactive) params['includeInactive'] = 'true';
    return this.http.get<{ data: OrgUnitNode[]; total?: number }>('/v1/org-units', { params });
  }
  getOrgUnit(id: string): Observable<OrgUnitDetail> {
    return this.http.get<OrgUnitDetail>(`/v1/org-units/${id}`);
  }
  createOrgUnit(body: { entityId: string; unitType: OrgUnitType; name: string; code?: string; parentId?: string; headUserId?: string }): Observable<OrgUnit> {
    return this.http.post<OrgUnit>('/v1/org-units', body);
  }
  updateOrgUnit(id: string, body: { name?: string; code?: string; parentId?: string }): Observable<OrgUnit> {
    return this.http.patch<OrgUnit>(`/v1/org-units/${id}`, body);
  }
  /** Send null to leave the seat vacant — the API treats absent and null alike. */
  setOrgUnitHead(id: string, headUserId: string | null): Observable<OrgUnit> {
    return this.http.patch<OrgUnit>(`/v1/org-units/${id}/head`, { headUserId });
  }
  deactivateOrgUnit(id: string): Observable<OrgUnit> {
    return this.http.patch<OrgUnit>(`/v1/org-units/${id}/deactivate`, {});
  }
  setUserPlacement(userId: string, body: { orgUnitId?: string | null; managerId?: string | null; personEntityId?: string | null }): Observable<unknown> {
    return this.http.patch(`/v1/users/${userId}/placement`, body);
  }
  approvalChain(userId: string): Observable<ApprovalChain> {
    return this.http.get<ApprovalChain>(`/v1/users/${userId}/approval-chain`);
  }

  // ── Verification Cases ──
  listCases(opts: { entityId?: string; status?: string; caseType?: string; limit?: number; offset?: number } = {}): Observable<CasePage> {
    const params: Record<string, string> = { limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) };
    if (opts.entityId) params['entityId'] = opts.entityId;
    if (opts.status) params['status'] = opts.status;
    if (opts.caseType) params['caseType'] = opts.caseType;
    return this.http.get<CasePage>('/v1/verification-cases', { params });
  }
  getCase(id: string): Observable<VerificationCase> { return this.http.get<VerificationCase>(`/v1/verification-cases/${id}`); }
  createCase(body: { entityId: string; caseType: string; priority?: string; dueDate?: string }): Observable<VerificationCase> {
    return this.http.post<VerificationCase>('/v1/verification-cases', body);
  }
  submitCase(id: string): Observable<VerificationCase> { return this.http.patch<VerificationCase>(`/v1/verification-cases/${id}/submit`, {}); }
  assignCase(id: string, reviewerId?: string): Observable<VerificationCase> {
    return this.http.patch<VerificationCase>(`/v1/verification-cases/${id}/assign`, reviewerId ? { reviewerId } : {});
  }
  reviewCase(id: string, reviewNotes: string): Observable<VerificationCase> {
    return this.http.patch<VerificationCase>(`/v1/verification-cases/${id}/review`, { reviewNotes });
  }
  approveCase(id: string): Observable<VerificationCase> { return this.http.patch<VerificationCase>(`/v1/verification-cases/${id}/approve`, {}); }
  rejectCase(id: string, rejectionReason: string): Observable<VerificationCase> {
    return this.http.patch<VerificationCase>(`/v1/verification-cases/${id}/reject`, { rejectionReason });
  }
  withdrawCase(id: string): Observable<VerificationCase> { return this.http.patch<VerificationCase>(`/v1/verification-cases/${id}/withdraw`, {}); }
  listEvidence(id: string): Observable<Evidence[]> { return this.http.get<Evidence[]>(`/v1/verification-cases/${id}/evidence`); }
  uploadEvidence(id: string, file: File, documentType: string, notes?: string): Observable<Evidence> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', documentType);
    if (notes) fd.append('notes', notes);
    return this.http.post<Evidence>(`/v1/verification-cases/${id}/evidence`, fd);
  }
  downloadEvidence(id: string, evidenceId: string): Observable<Blob> {
    return this.http.get(`/v1/verification-cases/${id}/evidence/${evidenceId}/download`, { responseType: 'blob' });
  }
  deleteEvidence(id: string, evidenceId: string): Observable<void> {
    return this.http.delete<void>(`/v1/verification-cases/${id}/evidence/${evidenceId}`);
  }

  // ── Relationships ──
  listRelationships(opts: { status?: string; relationshipType?: string; limit?: number; offset?: number } = {}): Observable<RelationshipPage> {
    const params: Record<string, string> = { limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) };
    if (opts.status) params['status'] = opts.status;
    if (opts.relationshipType) params['relationshipType'] = opts.relationshipType;
    return this.http.get<RelationshipPage>('/v1/entity-relationships', { params });
  }
  getRelationship(id: string): Observable<Relationship> { return this.http.get<Relationship>(`/v1/entity-relationships/${id}`); }
  listEntityRelationships(entityId: string, direction = 'both'): Observable<RelationshipPage> {
    return this.http.get<RelationshipPage>(`/v1/entities/${entityId}/relationships`, { params: { direction } });
  }
  createRelationship(body: {
    subjectEntityId: string; objectEntityId: string; relationshipType: string;
    startDate?: string; endDate?: string; ownershipPercent?: number; notes?: string;
  }): Observable<Relationship> {
    return this.http.post<Relationship>('/v1/entity-relationships', body);
  }
  updateRelationship(id: string, body: { startDate?: string; endDate?: string; ownershipPercent?: number; notes?: string }): Observable<Relationship> {
    return this.http.patch<Relationship>(`/v1/entity-relationships/${id}`, body);
  }
  deactivateRelationship(id: string): Observable<Relationship> {
    return this.http.patch<Relationship>(`/v1/entity-relationships/${id}/deactivate`, {});
  }

  // ── Objects (Phase 1 legacy) ──
  listObjects(page = 1, limit = 20, entityId?: string, objectType?: string): Observable<ObjectPage> {
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (entityId) params['entityId'] = entityId;
    if (objectType) params['objectType'] = objectType;
    return this.http.get<ObjectPage>('/v1/objects', { params });
  }
  getObject(id: string): Observable<ObjectRecord> { return this.http.get<ObjectRecord>(`/v1/objects/${id}`); }
  createObject(objectType: string, reference: string, entityId?: string, metadata?: Record<string, unknown>): Observable<ObjectRecord> {
    const body: Record<string, unknown> = { objectType, reference };
    if (entityId) body['entityId'] = entityId;
    if (metadata) body['metadata'] = metadata;
    return this.http.post<ObjectRecord>('/v1/objects', body);
  }

  // ── Verify / Audit ──
  verify(serial: string): Observable<VerificationResponse> {
    return this.http.get<VerificationResponse>(`/v1/verify/${serial}`);
  }
  listAuditLogs(opts: { page?: number; limit?: number; event?: string; entityId?: string; requestId?: string; from?: string; to?: string } = {}): Observable<AuditPage> {
    const params: Record<string, string> = { page: String(opts.page ?? 1), limit: String(opts.limit ?? 25) };
    if (opts.event) params['event'] = opts.event;
    if (opts.entityId) params['entityId'] = opts.entityId;
    if (opts.requestId) params['requestId'] = opts.requestId;
    if (opts.from) params['from'] = opts.from;
    if (opts.to) params['to'] = opts.to;
    return this.http.get<AuditPage>('/v1/audit-logs', { params });
  }
}
