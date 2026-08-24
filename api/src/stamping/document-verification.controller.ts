import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../auth/public.decorator';
import { DocumentVerificationService } from './document-verification.service';
import { MAX_STAMP_FILE_BYTES } from './stamp-storage.service';
import { renderVerificationPage } from './verification-page';

/**
 * Public document verification — the far end of the QR code.
 *
 * Deliberately NOT @SkipThrottle: unlike the certificate-status endpoints these
 * routes accept uploads from anonymous callers, so they keep the global
 * 10 req/60 s per-IP throttle.
 */
@ApiTags('verification')
@Controller('v1/verify')
export class DocumentVerificationController {
  constructor(private readonly svc: DocumentVerificationService) {}

  @Public()
  @ApiOperation({
    summary: 'Verify a stamped document by verification ID (QR code target)',
    description:
      'Returns HTML to browsers (QR scans) and JSON to API clients. Reports what the register holds; upload the file itself for an authoritative check of the copy you have.',
  })
  @ApiOkResponse()
  @Get('document/:verificationId')
  async verifyById(
    @Param('verificationId') verificationId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.svc.verifyById(verificationId);

    if (this.wantsHtml(req)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderVerificationPage(result));
      return;
    }
    res.json(result);
  }

  @Public()
  @ApiOperation({
    summary: 'Verify an actual document file (tamper check)',
    description:
      'Hashes the uploaded bytes and verifies the recorded signature against them. Any change made after stamping surfaces as TAMPERED. Optionally pass verificationId to check against a specific stamp.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse()
  @Post('document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_STAMP_FILE_BYTES },
    }),
  )
  verifyUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { verificationId?: string },
  ) {
    return this.svc.verifyUpload(file, body?.verificationId?.trim() || undefined);
  }

  private wantsHtml(req: Request): boolean {
    const accept = req.headers.accept ?? '';
    return accept.includes('text/html');
  }
}
