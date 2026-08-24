/**
 * Minimal server-rendered result page for people who SCAN the QR code.
 *
 * The QR on a stamped document is scanned by a phone camera, which opens a
 * browser — raw JSON is useless there. This is deliberately a single
 * self-contained page with no assets and no framework: the Angular portal owns
 * the operator UI, this owns the "member of the public checks a document" path.
 * API clients get JSON from the same endpoint via content negotiation.
 */

const PALETTE = {
  VALID: { bg: '#0f766e', label: 'AUTHENTIC' },
  TAMPERED: { bg: '#b91c1c', label: 'ALTERED' },
  NO_MATCHING_STAMP: { bg: '#b91c1c', label: 'NOT FOUND' },
  SIGNATURE_INVALID: { bg: '#b91c1c', label: 'INVALID SIGNATURE' },
  CERTIFICATE_REVOKED: { bg: '#b45309', label: 'CERTIFICATE REVOKED' },
  CERTIFICATE_EXPIRED: { bg: '#b45309', label: 'CERTIFICATE EXPIRED' },
  UNVERIFIABLE_COPY: { bg: '#57534e', label: 'NOT RE-VERIFIED' },
} as const;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
}

export function renderVerificationPage(result: any): string {
  const tone = PALETTE[result.status as keyof typeof PALETTE] ?? PALETTE.UNVERIFIABLE_COPY;
  const doc = result.document ?? {};
  const cert = result.certificate ?? {};
  const issuer = result.issuer ?? {};

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Document verification — ${esc(result.verificationId ?? 'unknown')}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; padding:24px; font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
         background:#f6f7f9; color:#18181b; }
  @media (prefers-color-scheme: dark) { body { background:#101014; color:#e8e8ea; } .card { background:#1a1a1f !important; } th { color:#a1a1aa !important; } }
  .wrap { max-width: 640px; margin: 0 auto; }
  .banner { background:${tone.bg}; color:#fff; border-radius:12px; padding:20px 22px; }
  .banner h1 { margin:0 0 6px; font-size:22px; letter-spacing:.02em; }
  .banner p { margin:0; opacity:.92; font-size:14px; }
  .card { background:#fff; border-radius:12px; padding:6px 22px 18px; margin-top:16px;
          box-shadow:0 1px 2px rgba(0,0,0,.08); }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; opacity:.6; margin:18px 0 8px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-weight:500; color:#52525b; width:40%; padding:5px 0; vertical-align:top; font-size:14px; }
  td { padding:5px 0; word-break:break-word; font-size:14px; }
  code { font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-all; }
  footer { margin:18px 4px; font-size:12.5px; opacity:.6; }
</style>
</head>
<body>
<div class="wrap">
  <div class="banner">
    <h1>${esc(tone.label)}</h1>
    <p>${esc(result.message ?? '')}</p>
  </div>

  ${
    result.verificationId
      ? `<div class="card">
    <h2>Document</h2>
    <table>
      ${row('Verification ID', result.verificationId)}
      ${row('Name', doc.name)}
      ${row('Stamped at', doc.stampedAt)}
      ${row('Pages', doc.pageCount)}
      ${doc.stampedHash ? `<tr><th>Content hash (SHA-256)</th><td><code>${esc(doc.stampedHash)}</code></td></tr>` : ''}
    </table>

    <h2>Issued by</h2>
    <table>
      ${row('Entity', issuer.name)}
      ${row('Country', issuer.country)}
      ${row('Type', issuer.entityType)}
      ${row('Verification status', issuer.entityStatus)}
    </table>

    <h2>Signing certificate</h2>
    <table>
      ${row('Serial', cert.serial)}
      ${row('Issuer', cert.issuer)}
      ${row('Valid from', cert.validFrom)}
      ${row('Valid to', cert.validTo)}
      ${row('Revoked', cert.isRevoked === undefined ? '' : cert.isRevoked ? 'Yes' : 'No')}
    </table>
  </div>`
      : ''
  }

  <footer>
    Checked ${esc(result.checkedAt ?? new Date().toISOString())}.
    To verify a copy you hold, upload it to <code>POST /v1/verify/document</code>.
  </footer>
</div>
</body>
</html>`;
}
