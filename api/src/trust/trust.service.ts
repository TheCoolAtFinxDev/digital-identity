import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { execFile as execFileCb } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';

const execFile = promisify(execFileCb);

@Injectable()
export class TrustService {
  private readonly caDir = process.env.CA_DIR ?? '/opt/ee-ca';

  constructor(private readonly prisma: PrismaService) {}

  /** The CA certificate chain (trust anchor) relying parties need to validate certs. */
  getCaChain(): string {
    const intermediate = join(this.caDir, 'certs/intermediate.cert.pem');
    if (!existsSync(intermediate)) {
      throw new InternalServerErrorException('CA certificate not found');
    }
    let chain = readFileSync(intermediate, 'utf8').trim();
    // Append a root cert if the CA hierarchy has one
    for (const root of ['certs/ca.cert.pem', 'certs/root.cert.pem']) {
      const p = join(this.caDir, root);
      if (existsSync(p)) chain += '\n' + readFileSync(p, 'utf8').trim();
    }
    return chain + '\n';
  }

  /** Generate the current X.509 CRL (signed by the CA) from the CA database. */
  async generateCrl(): Promise<string> {
    const work = mkdtempSync(join(tmpdir(), 'crl-'));
    const out = join(work, 'crl.pem');
    try {
      await execFile('openssl', [
        'ca', '-config', join(this.caDir, 'openssl.cnf'),
        '-gencrl', '-crldays', '7', '-out', out,
      ], { timeout: 15000 });
      return readFileSync(out, 'utf8');
    } catch (err) {
      throw new InternalServerErrorException(`CRL generation failed: ${(err as Error).message}`);
    } finally {
      try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /** OCSP-lite per-serial status, from the authoritative DB record. */
  async certificateStatus(serial: string) {
    const cert = await this.prisma.certificate.findUnique({ where: { serial } });
    if (!cert) {
      return { serial, status: 'UNKNOWN' as const, checkedAt: new Date() };
    }
    const now = new Date();
    const status = cert.isRevoked ? 'REVOKED' : now > cert.validTo ? 'EXPIRED' : 'GOOD';
    return {
      serial,
      status,
      isRevoked: cert.isRevoked,
      revokedAt: cert.revokedAt,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      checkedAt: now,
    };
  }
}
