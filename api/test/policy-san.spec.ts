import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolicyService } from '../src/policy/policy.service';

/**
 * SAN handling is the one place a certificate request gets to influence what
 * ends up inside the issued certificate, so it is worth testing against real
 * CSRs rather than a hand-written fixture string — the parser has to survive
 * whatever `openssl req -text` actually prints.
 */
describe('PolicyService.extractSubjectAltNames', () => {
  const svc = new PolicyService();
  let work: string;
  let key: string;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'san-spec-'));
    key = join(work, 'key.pem');
    execFileSync('openssl', ['genrsa', '-out', key, '2048'], { stdio: 'ignore' });
  });

  afterAll(() => rmSync(work, { recursive: true, force: true }));

  /** Build a CSR whose requested extensions are exactly `exts`. */
  const csrWith = (exts: string): string => {
    const cnf = join(work, 'req.cnf');
    const out = join(work, 'req.csr.pem');
    writeFileSync(
      cnf,
      `[req]\ndistinguished_name = dn\nreq_extensions = exts\nprompt = no\n` +
        `[dn]\nC = LS\nO = Test Co\nCN = test.example.ls\n[exts]\n${exts}\n`,
    );
    execFileSync('openssl', ['req', '-new', '-key', key, '-out', out, '-config', cnf], {
      stdio: 'ignore',
    });
    return require('node:fs').readFileSync(out, 'utf8');
  };

  it('keeps DNS and email names that pass validation', async () => {
    const sans = await svc.extractSubjectAltNames(
      csrWith('subjectAltName = DNS:portal.example.ls, email:ops@example.ls'),
    );
    expect(sans).toEqual(['DNS:portal.example.ls', 'email:ops@example.ls']);
  });

  it('keeps IP and https URI names', async () => {
    const sans = await svc.extractSubjectAltNames(
      csrWith('subjectAltName = IP:10.1.2.3, URI:https://example.ls/profile'),
    );
    expect(sans).toEqual(['IP:10.1.2.3', 'URI:https://example.ls/profile']);
  });

  it('drops a malformed DNS name but keeps its valid siblings', async () => {
    const sans = await svc.extractSubjectAltNames(
      csrWith('subjectAltName = DNS:good.example.ls, DNS:!!!not-a-host!!!'),
    );
    expect(sans).toEqual(['DNS:good.example.ls']);
  });

  it('drops general-name types the platform will not vouch for', async () => {
    // otherName is the classic smuggling vector; it must not survive.
    const sans = await svc.extractSubjectAltNames(
      csrWith('subjectAltName = otherName:1.2.3.4;UTF8:smuggled, DNS:kept.example.ls'),
    );
    expect(sans).toEqual(['DNS:kept.example.ls']);
  });

  it('de-duplicates repeated names', async () => {
    const sans = await svc.extractSubjectAltNames(
      csrWith('subjectAltName = DNS:dup.example.ls, DNS:dup.example.ls'),
    );
    expect(sans).toEqual(['DNS:dup.example.ls']);
  });

  it('returns nothing for a CSR that requested no SANs', async () => {
    const csr = execFileSync(
      'openssl',
      ['req', '-new', '-key', key, '-subj', '/C=LS/O=Test Co/CN=plain.example.ls'],
      { encoding: 'utf8' },
    );
    expect(await svc.extractSubjectAltNames(csr)).toEqual([]);
  });

  it('returns nothing rather than throwing on unparsable input', async () => {
    expect(await svc.extractSubjectAltNames('not a csr at all')).toEqual([]);
  });
});
