import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermission } from '../iam/permission.decorator';
import { AssignCaseDto } from './dto/assign-case.dto';
import { CaseQueryDto } from './dto/case-query.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { RejectCaseDto } from './dto/reject-case.dto';
import { ReviewCaseDto } from './dto/review-case.dto';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { VerificationCasesService } from './verification-cases.service';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

@ApiTags('verification-cases')
@ApiBearerAuth()
@Controller('v1/verification-cases')
export class VerificationCasesController {
  constructor(private readonly svc: VerificationCasesService) {}

  // ── Cases ──────────────────────────────────────────────────────────────────

  @RequirePermission('entity:onboard')
  @ApiOperation({ summary: 'Create a new KYC or KYB verification case' })
  @ApiCreatedResponse()
  @Post()
  createCase(@Body() dto: CreateCaseDto, @Request() req: any) {
    return this.svc.createCase(dto, req.user.userId);
  }

  @RequirePermission('entity:read')
  @ApiOperation({ summary: 'List verification cases (paginated)' })
  @ApiOkResponse()
  @Get()
  listCases(@Query() query: CaseQueryDto) {
    return this.svc.listCases(query);
  }

  @RequirePermission('entity:read')
  @ApiOperation({ summary: 'Get a verification case by ID' })
  @ApiOkResponse()
  @Get(':id')
  getCaseById(@Param('id') id: string) {
    return this.svc.getCaseById(id);
  }

  @RequirePermission('entity:onboard')
  @ApiOperation({ summary: 'Submit a draft case for review' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/submit')
  submitCase(@Param('id') id: string, @Request() req: any) {
    return this.svc.submitCase(id, req.user.userId);
  }

  @RequirePermission('entity:review')
  @ApiOperation({ summary: 'Assign a reviewer to a submitted case' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/assign')
  assignCase(@Param('id') id: string, @Body() dto: AssignCaseDto, @Request() req: any) {
    return this.svc.assignCase(id, dto, req.user.userId);
  }

  @RequirePermission('entity:review')
  @ApiOperation({ summary: 'Complete the review step and move to pending approval' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/review')
  reviewCase(@Param('id') id: string, @Body() dto: ReviewCaseDto, @Request() req: any) {
    return this.svc.reviewCase(id, dto, req.user.userId);
  }

  @RequirePermission('entity:approve')
  @ApiOperation({ summary: 'Approve a case — advances entity status to APPROVED' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/approve')
  approveCase(@Param('id') id: string, @Request() req: any) {
    return this.svc.approveCase(id, req.user.userId);
  }

  @RequirePermission('entity:reject')
  @ApiOperation({ summary: 'Reject a case — advances entity status to REJECTED' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/reject')
  rejectCase(@Param('id') id: string, @Body() dto: RejectCaseDto, @Request() req: any) {
    return this.svc.rejectCase(id, dto, req.user.userId);
  }

  @RequirePermission('entity:onboard')
  @ApiOperation({ summary: 'Withdraw a draft or submitted case' })
  @ApiOkResponse()
  @HttpCode(200)
  @Patch(':id/withdraw')
  withdrawCase(@Param('id') id: string, @Request() req: any) {
    return this.svc.withdrawCase(id, req.user.userId);
  }

  // ── Evidence ───────────────────────────────────────────────────────────────

  @RequirePermission('entity:onboard')
  @ApiOperation({ summary: 'Upload an evidence document (DRAFT cases only)' })
  @ApiCreatedResponse()
  @ApiConsumes('multipart/form-data')
  @Post(':id/evidence')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  uploadEvidence(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadEvidenceDto,
    @Request() req: any,
  ) {
    return this.svc.uploadEvidence(id, file, dto, req.user.userId);
  }

  @RequirePermission('entity:read')
  @ApiOperation({ summary: 'List evidence records for a case' })
  @ApiOkResponse()
  @Get(':id/evidence')
  listEvidence(@Param('id') id: string) {
    return this.svc.listEvidence(id);
  }

  @RequirePermission('entity:read')
  @ApiOperation({ summary: 'Download an evidence file' })
  @Get(':id/evidence/:evidenceId/download')
  async downloadEvidence(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: Response,
  ) {
    const { filePath, fileName } = await this.svc.getEvidenceFile(id, evidenceId);
    res.download(filePath, fileName);
  }

  @RequirePermission('entity:onboard')
  @ApiOperation({ summary: 'Delete an evidence document (DRAFT cases only)' })
  @ApiNoContentResponse()
  @HttpCode(204)
  @Delete(':id/evidence/:evidenceId')
  async deleteEvidence(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Request() req: any,
  ) {
    await this.svc.deleteEvidence(id, evidenceId, req.user.userId);
  }
}
