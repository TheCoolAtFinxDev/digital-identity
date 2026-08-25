import {
  Body, Controller, Get, Param, Patch, Post, Request, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission } from '../iam/permission.decorator';
import { GlobalScope, ScopedTo } from '../iam/scope.decorator';
import { DocumentsService } from './documents.service';
import { NoteDto, ReasonDto, RequestSignaturesDto, SignDocumentDto } from './dto/staff.dto';

@ApiTags('staff-documents')
@ApiBearerAuth()
@Controller('v1/documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @ApiOperation({ summary: 'Bring a document onto the platform' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, name: { type: 'string' } } } })
  @RequirePermission('document:create')
  // Uploading creates something that does not exist yet, so there is nothing to
  // scope it against — the permission alone decides.
  @GlobalScope()
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  upload(@UploadedFile() file: Express.Multer.File, @Body('name') name: string, @Request() req: any) {
    return this.svc.upload(file, name, req.user.userId);
  }

  @ApiOperation({ summary: 'A document, its sign-off trail and where it stands' })
  @ApiOkResponse()
  @RequirePermission('document:read')
  // Visibility is per-document and enforced in the service: the owner, anyone
  // asked to sign, and the two people on its stamp request. A scope declaration
  // cannot express "was asked to act on this", so the route is not narrowable
  // and the service does the work.
  @GlobalScope()
  @Get(':id')
  detail(@Param('id') id: string, @Request() req: any) {
    return this.svc.detail(id, req.user.userId);
  }

  @ApiOperation({ summary: 'Download the document — the stamped copy once it has been sealed' })
  @RequirePermission('document:read')
  @GlobalScope()
  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.svc.download(id, req.user.userId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Sign with your own key' })
  @RequirePermission('document:sign')
  @GlobalScope()
  @Post(':id/sign')
  sign(@Param('id') id: string, @Body() dto: SignDocumentDto, @Request() req: any) {
    return this.svc.sign(id, req.user.userId, dto.note);
  }

  @ApiOperation({ summary: 'Ask named people to sign' })
  @RequirePermission('document:create')
  @GlobalScope()
  @Post(':id/signature-requests')
  requestSignatures(@Param('id') id: string, @Body() dto: RequestSignaturesDto, @Request() req: any) {
    return this.svc.requestSignatures(id, dto.signerIds, req.user.userId);
  }

  @ApiOperation({ summary: 'Decline to sign' })
  @RequirePermission('document:sign')
  @GlobalScope()
  @Patch(':id/decline')
  decline(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.svc.decline(id, req.user.userId, dto.reason);
  }

  @ApiOperation({
    summary: 'Recall this document',
    description: 'Withdraws ONE document. It does not revoke the key that signed it, and everything else that key signed stays valid.',
  })
  @RequirePermission('document:create')
  @GlobalScope()
  @Patch(':id/recall')
  recall(@Param('id') id: string, @Body() dto: ReasonDto, @Request() req: any) {
    return this.svc.recall(id, req.user.userId, dto.reason);
  }

  @ApiOperation({
    summary: 'Replace this document with a corrected version',
    description: 'The old document is marked superseded and points at its replacement, so anyone checking the old copy is told where the current one is.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, name: { type: 'string' } } } })
  @RequirePermission('document:create')
  @GlobalScope()
  @UseInterceptors(FileInterceptor('file'))
  @Post(':id/replace')
  replace(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Request() req: any,
  ) {
    return this.svc.replace(id, file, name, req.user.userId);
  }
}
