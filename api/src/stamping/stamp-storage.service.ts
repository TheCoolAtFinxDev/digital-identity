import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { STAMP_STORAGE_ROOT } from '../bootstrap/bootstrap.service';

/** 20 MB — same per-file ceiling as verification-case evidence. */
export const MAX_STAMP_FILE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class StampStorageService {
  private readonly logger = new Logger(StampStorageService.name);

  readonly maxFileBytes = MAX_STAMP_FILE_BYTES;

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  safeFilename(original: string): string {
    return (
      original
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^\.+/, '_')
        .substring(0, 128) || 'document'
    );
  }

  stampDir(stampId: string): string {
    return join(STAMP_STORAGE_ROOT, stampId);
  }

  /** Uploaded staff documents live alongside stamped artifacts, keyed by id. */
  documentDir(documentId: string): string {
    return join(STAMP_STORAGE_ROOT, 'documents', documentId);
  }

  /** Writes an uploaded document and returns where it landed. */
  async writeDocument(documentId: string, filename: string, buffer: Buffer): Promise<string> {
    const dir = this.documentDir(documentId);
    const filePath = join(dir, this.safeFilename(filename));
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, buffer);
    } catch (err: any) {
      this.logger.error(`Failed to write document: ${err.message}`);
      throw new InternalServerErrorException(
        'Document storage is not available. Contact the system administrator.',
      );
    }
    return filePath;
  }

  /** Writes the stamped artifact and returns where it landed. */
  async writeStamped(stampId: string, filename: string, buffer: Buffer): Promise<string> {
    const filePath = join(this.stampDir(stampId), this.safeFilename(filename));
    try {
      await mkdir(this.stampDir(stampId), { recursive: true });
      await writeFile(filePath, buffer);
    } catch (err: any) {
      this.logger.error(`Failed to write stamped document: ${err.message}`);
      throw new InternalServerErrorException(
        'Stamp storage is not available. Contact the system administrator.',
      );
    }
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    try {
      return await readFile(filePath);
    } catch (err: any) {
      this.logger.error(`Stamped document missing at ${filePath}: ${err.message}`);
      throw new NotFoundException('Stamped document file is no longer available on disk');
    }
  }
}
