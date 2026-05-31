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
}
