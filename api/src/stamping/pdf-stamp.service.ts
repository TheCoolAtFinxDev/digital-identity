import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as QRCode from 'qrcode';

export type StampPageTarget = 'FIRST' | 'LAST' | 'ALL';

export interface VisibleStampContent {
  /** Line under the heading — normally the verified legal entity name. */
  issuerName: string;
  /** Human/QR-friendly identifier the verifier types or scans. */
  verificationId: string;
  /** URL the QR code resolves to. */
  verifyUrl: string;
  stampedAt: Date;
}

const BOX_WIDTH = 250;
const BOX_HEIGHT = 86;
const MARGIN = 24;
const QR_SIZE = 62;
const PAD = 10;

/**
 * Renders the *visible* half of a digital stamp: the seal a human sees on the
 * page, plus the QR code that takes them to the verification endpoint. The
 * cryptographic half (the HSM signature) is applied by StampingService to the
 * bytes this produces, so what the recipient holds is exactly what was signed.
 */
@Injectable()
export class PdfStampService {
  private readonly logger = new Logger(PdfStampService.name);

  /** A PDF always starts with the %PDF- magic bytes. */
  isPdf(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  }

  async pageCount(buffer: Buffer): Promise<number | null> {
    try {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: false });
      return doc.getPageCount();
    } catch {
      return null;
    }
  }

  /**
   * Draws the visible stamp onto the requested page(s) and returns the new PDF
   * bytes. Throws if the PDF cannot be opened (encrypted, corrupt) — the caller
   * decides whether to fall back to a signature-only stamp.
   */
  async apply(
    pdfBytes: Buffer,
    content: VisibleStampContent,
    target: StampPageTarget = 'LAST',
  ): Promise<{ bytes: Buffer; pageCount: number }> {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const qrPng = await QRCode.toBuffer(content.verifyUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 240,
    });
    const qrImage = await doc.embedPng(qrPng);

    const pages = doc.getPages();
    const targets: PDFPage[] =
      target === 'ALL' ? pages : target === 'FIRST' ? [pages[0]] : [pages[pages.length - 1]];

    for (const page of targets) {
      this.drawStamp(page, font, bold, qrImage, content);
    }

    const out = await doc.save();
    return { bytes: Buffer.from(out), pageCount: pages.length };
  }

  private drawStamp(
    page: PDFPage,
    font: PDFFont,
    bold: PDFFont,
    qrImage: Awaited<ReturnType<PDFDocument['embedPng']>>,
    content: VisibleStampContent,
  ) {
    const { width } = page.getSize();

    // Bottom-right, clamped so it still fits on narrow/rotated pages.
    const x = Math.max(MARGIN, width - BOX_WIDTH - MARGIN);
    const y = MARGIN;

    const ink = rgb(0.06, 0.24, 0.44);
    const muted = rgb(0.35, 0.4, 0.46);

    page.drawRectangle({
      x,
      y,
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      color: rgb(1, 1, 1),
      opacity: 0.92,
      borderColor: ink,
      borderWidth: 1.2,
    });

    page.drawImage(qrImage, {
      x: x + PAD,
      y: y + (BOX_HEIGHT - QR_SIZE) / 2,
      width: QR_SIZE,
      height: QR_SIZE,
    });

    const textX = x + PAD + QR_SIZE + PAD;
    const maxTextWidth = BOX_WIDTH - (textX - x) - PAD;
    let cursor = y + BOX_HEIGHT - PAD - 8;

    page.drawText('DIGITALLY STAMPED', { x: textX, y: cursor, size: 8.5, font: bold, color: ink });
    cursor -= 12;

    page.drawText(this.fit(content.issuerName, font, 7.5, maxTextWidth), {
      x: textX,
      y: cursor,
      size: 7.5,
      font,
      color: ink,
    });
    cursor -= 11;

    const stamped = content.stampedAt.toISOString().replace('T', ' ').substring(0, 16);
    page.drawText(`${stamped} UTC`, { x: textX, y: cursor, size: 7, font, color: muted });
    cursor -= 11;

    page.drawText(this.fit(content.verificationId, font, 7, maxTextWidth), {
      x: textX,
      y: cursor,
      size: 7,
      font: bold,
      color: ink,
    });
    cursor -= 10;

    page.drawText(this.fit('Scan to verify authenticity', font, 6.2, maxTextWidth), {
      x: textX,
      y: cursor,
      size: 6.2,
      font,
      color: muted,
    });
  }

  /** Truncate with an ellipsis so long legal names never overflow the box. */
  private fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
    // pdf-lib throws on characters the standard font can't encode (e.g. emoji);
    // strip to WinAnsi-safe printable ASCII first.
    let safe = text.replace(/[^\x20-\x7E]/g, '');
    if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
    while (safe.length > 1 && font.widthOfTextAtSize(`${safe}...`, size) > maxWidth) {
      safe = safe.slice(0, -1);
    }
    return `${safe}...`;
  }

  /** Standalone QR PNG for the verification URL (portal / re-print use). */
  async qrPng(verifyUrl: string): Promise<Buffer> {
    return QRCode.toBuffer(verifyUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });
  }
}
