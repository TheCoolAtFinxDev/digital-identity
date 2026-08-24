import {
  DocumentVerificationStatus,
  explainDocumentStatus,
  resolveDocumentStatus,
} from '../src/stamping/document-verification.service';

/**
 * This matrix is the product promise: it decides whether someone holding a
 * document is told it is authentic. Every branch is asserted, including the
 * precedence between them — a tampered document must never be reported as
 * merely "certificate expired", and an un-rechecked copy must never be
 * reported as either good or bad.
 */
describe('resolveDocumentStatus', () => {
  const checks = (over: Partial<Parameters<typeof resolveDocumentStatus>[0]> = {}) => ({
    hashMatches: true,
    signatureValid: true as boolean | null,
    isRevoked: false,
    isExpired: false,
    ...over,
  });

  it('is VALID when the bytes match, the signature verifies and the certificate holds', () => {
    expect(resolveDocumentStatus(checks())).toBe('VALID');
  });

  it('is TAMPERED when the bytes no longer match the stamp', () => {
    expect(resolveDocumentStatus(checks({ hashMatches: false }))).toBe('TAMPERED');
  });

  it('is SIGNATURE_INVALID when the bytes match but the signature does not verify', () => {
    expect(resolveDocumentStatus(checks({ signatureValid: false }))).toBe('SIGNATURE_INVALID');
  });

  it('is UNVERIFIABLE_COPY when the signature could not be re-checked', () => {
    expect(resolveDocumentStatus(checks({ signatureValid: null }))).toBe('UNVERIFIABLE_COPY');
  });

  it('is CERTIFICATE_REVOKED when the content is intact but trust was withdrawn', () => {
    expect(resolveDocumentStatus(checks({ isRevoked: true }))).toBe('CERTIFICATE_REVOKED');
  });

  it('is CERTIFICATE_EXPIRED when the content is intact but the certificate lapsed', () => {
    expect(resolveDocumentStatus(checks({ isExpired: true }))).toBe('CERTIFICATE_EXPIRED');
  });

  describe('precedence', () => {
    it('tampering outranks a revoked certificate', () => {
      expect(resolveDocumentStatus(checks({ hashMatches: false, isRevoked: true }))).toBe('TAMPERED');
    });

    it('tampering outranks an unverifiable copy', () => {
      expect(resolveDocumentStatus(checks({ hashMatches: false, signatureValid: null }))).toBe(
        'TAMPERED',
      );
    });

    it('an unverified signature is never reported as a certificate problem', () => {
      expect(
        resolveDocumentStatus(checks({ signatureValid: null, isRevoked: true, isExpired: true })),
      ).toBe('UNVERIFIABLE_COPY');
    });

    it('a broken signature outranks a revoked certificate', () => {
      expect(resolveDocumentStatus(checks({ signatureValid: false, isRevoked: true }))).toBe(
        'SIGNATURE_INVALID',
      );
    });

    it('revocation outranks expiry', () => {
      expect(resolveDocumentStatus(checks({ isRevoked: true, isExpired: true }))).toBe(
        'CERTIFICATE_REVOKED',
      );
    });
  });

  it('never reports VALID unless every check passed', () => {
    for (const hashMatches of [true, false]) {
      for (const signatureValid of [true, false, null]) {
        for (const isRevoked of [true, false]) {
          for (const isExpired of [true, false]) {
            const status = resolveDocumentStatus({ hashMatches, signatureValid, isRevoked, isExpired });
            const everythingHeld = hashMatches && signatureValid === true && !isRevoked && !isExpired;
            expect(status === 'VALID').toBe(everythingHeld);
          }
        }
      }
    }
  });
});

describe('explainDocumentStatus', () => {
  const all: DocumentVerificationStatus[] = [
    'VALID',
    'TAMPERED',
    'NO_MATCHING_STAMP',
    'SIGNATURE_INVALID',
    'CERTIFICATE_REVOKED',
    'CERTIFICATE_EXPIRED',
    'UNVERIFIABLE_COPY',
  ];

  it('has distinct wording for every verdict', () => {
    const messages = all.map(explainDocumentStatus);
    expect(messages.every((m) => m.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(all.length);
  });

  it('does not tell someone holding an altered document that it is authentic', () => {
    for (const status of all.filter((s) => s !== 'VALID')) {
      expect(explainDocumentStatus(status).toLowerCase()).not.toContain('authentic.');
    }
  });
});
