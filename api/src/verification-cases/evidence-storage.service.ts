import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { EVIDENCE_STORAGE_ROOT } from '../bootstrap/bootstrap.service';

const MAX_FILE_BYTES = 20 * 1024 * 1024;   // 20 MB
const MAX_CASE_BYTES = 100 * 1024 * 1024;  // 100 MB

@Injectable()
export class EvidenceStorageService {
  private readonly logger = new Logger(EvidenceStorageService.name);

  readonly maxFileBytes = MAX_FILE_BYTES;
  readonly maxCaseBytes = MAX_CASE_BYTES;

  caseDir(caseId: string): string {
    return join(EVIDENCE_STORAGE_ROOT, 'verification-cases', caseId);
  }

  evidencePath(caseId: string, evidenceId: string, safeFilename: string): string {
    return join(this.caseDir(caseId), `${evidenceId}-${safeFilename}`);
  }

  safeFilename(original: string): string {
    return original
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^\.+/, '_')
      .substring(0, 128) || 'file';
  }

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async writeEvidence(
    caseId: string,
    evidenceId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<{ filePath: string; sha256Hash: string }> {
    const safe = this.safeFilename(filename);
    const filePath = this.evidencePath(caseId, evidenceId, safe);

    try {
      await mkdir(this.caseDir(caseId), { recursive: true });
      await writeFile(filePath, buffer);
    } catch (err: any) {
      this.logger.error(`Failed to write evidence file: ${err.message}`);
      throw new InternalServerErrorException(
        'Evidence storage is not available. Contact the system administrator.',
      );
    }

    return { filePath, sha256Hash: this.sha256(buffer) };
  }

  async deleteEvidence(filePath: string): Promise<void> {
    try {
      await rm(filePath, { force: true });
    } catch (err: any) {
      this.logger.warn(`Could not delete evidence file at ${filePath}: ${err.message}`);
    }
  }
}
