import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile as execFileCb } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const ALLOWED_PROFILES = new Set(['usr_entity_cert', 'usr_cert']);
const MIN_KEY_BITS = 2048;
const REQUIRED_DN = ['C', 'O', 'CN'];

// Subject Alternative Name acceptance rules (see extractSubjectAltNames).
const MAX_SAN_ENTRIES = 20;
const DNS_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const EMAIL_RE = /^[^\s@,"']+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

export interface CsrMeta {
  subject: string;
  keyBits: number;
}

@Injectable()
export class PolicyService {
  async validateCsr(csrPem: string, profile: string): Promise<CsrMeta> {
    if (!csrPem?.includes('BEGIN CERTIFICATE REQUEST')) {
      throw new BadRequestException('Invalid CSR PEM');
    }

    if (!ALLOWED_PROFILES.has(profile)) {
      throw new BadRequestException(`Unknown certificate profile: ${profile}`);
    }

    const work = mkdtempSync(join(tmpdir(), 'policy-'));
    const csrPath = join(work, 'req.csr.pem');
    writeFileSync(csrPath, csrPem, { mode: 0o600 });

    try {
      const [subjectResult, textResult] = await Promise.all([
        execFile('openssl', ['req', '-subject', '-noout', '-in', csrPath], { timeout: 5000 }),
        execFile('openssl', ['req', '-text', '-noout', '-in', csrPath], { timeout: 5000 }),
      ]);

      const subject = subjectResult.stdout.replace(/^subject=\s*/i, '').trim();
      if (!subject) {
        throw new BadRequestException('Could not parse CSR subject');
      }

      for (const field of REQUIRED_DN) {
        if (!new RegExp(`\\b${field}\\s*=`).test(subject)) {
          throw new BadRequestException(`Required DN field missing: ${field}`);
        }
      }

      const keyMatch = textResult.stdout.match(/Public-Key:\s*\((\d+)\s*bit\)/);
      if (!keyMatch) {
        throw new BadRequestException('Could not determine key size from CSR');
      }

      const keyBits = parseInt(keyMatch[1], 10);
      if (keyBits < MIN_KEY_BITS) {
        throw new BadRequestException(
          `Key size ${keyBits} bits is below the minimum of ${MIN_KEY_BITS} bits`,
        );
      }

      return { subject, keyBits };
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Extract the Subject Alternative Names a CSR asks for, keeping only the
   * general-name types this platform will vouch for.
   *
   * The CA runs with `copy_extensions = none` — a CSR is an untrusted document
   * and blanket-copying its extensions is how a requester ends up minting
   * themselves `basicConstraints = CA:true`. So SANs are re-derived here,
   * validated, and re-emitted by the issuer into a generated extension file.
   * Anything exotic (otherName, dirName, registeredID, ...) is dropped rather
   * than passed through.
   */
  async extractSubjectAltNames(csrPem: string): Promise<string[]> {
    const work = mkdtempSync(join(tmpdir(), 'san-'));
    const csrPath = join(work, 'req.csr.pem');
    writeFileSync(csrPath, csrPem, { mode: 0o600 });

    try {
      const { stdout } = await execFile('openssl', ['req', '-text', '-noout', '-in', csrPath], {
        timeout: 5000,
      });

      // The SAN values sit on the line(s) after the extension header.
      const match = stdout.match(
        /X509v3 Subject Alternative Name:[^\n]*\n((?:\s{8,}[^\n]*\n?)+)/,
      );
      if (!match) return [];

      const entries = match[1]
        .split(/[,\n]/)
        .map((e) => e.trim())
        .filter(Boolean);

      const accepted: string[] = [];
      for (const entry of entries) {
        const normalised = this.normaliseSan(entry);
        if (normalised && !accepted.includes(normalised)) accepted.push(normalised);
        if (accepted.length >= MAX_SAN_ENTRIES) break;
      }
      return accepted;
    } catch {
      // A CSR without parsable extensions simply has no SANs to honour.
      return [];
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /** Map one printed general name to its config form, or null if not allowed. */
  private normaliseSan(entry: string): string | null {
    const [rawType, ...rest] = entry.split(':');
    const value = rest.join(':').trim();
    if (!value) return null;

    switch (rawType.trim()) {
      case 'DNS':
        return DNS_RE.test(value) ? `DNS:${value}` : null;
      case 'email':
      case 'Email':
        return EMAIL_RE.test(value) ? `email:${value}` : null;
      case 'IP Address':
      case 'IP':
        return IPV4_RE.test(value) || IPV6_RE.test(value) ? `IP:${value}` : null;
      case 'URI':
        return /^https?:\/\/[^\s"']+$/i.test(value) ? `URI:${value}` : null;
      default:
        return null;
    }
  }
}
