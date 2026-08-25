import { Body, Controller, Get, Param, Patch, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { GlobalScope } from '../iam/scope.decorator';
import { CreateStampRequestDto, NoteDto } from '../documents/dto/staff.dto';
import { StampRequestsService } from './stamp-requests.service';

@ApiTags('stamp-requests')
@ApiBearerAuth()
@Controller('v1/stamp-requests')
export class StampRequestsController {
  constructor(private readonly svc: StampRequestsService) {}

  @ApiOperation({ summary: "Ask for your unit's seal on a document" })
  @ApiCreatedResponse()
  @RequirePermission('stamp:request')
  // Which unit's seal is not chosen by the caller — it is the unit the chart
  // says they work in — so there is nothing in the request to scope against.
  @GlobalScope()
  @Post()
  create(@Body() dto: CreateStampRequestDto, @Request() req: any) {
    return this.svc.create(dto.documentId, req.user.userId);
  }

  @ApiOperation({ summary: 'A stamp request and its approval chain' })
  @ApiOkResponse()
  @RequirePermission('stamp:request')
  // Visible only to the requester and the two people the chart put on it,
  // enforced in the service — a scope declaration cannot express that.
  @GlobalScope()
  @Get(':id')
  get(@Param('id') id: string, @Request() req: any) {
    return this.svc.get(id, req.user.userId);
  }

  @ApiOperation({
    summary: 'Submit for review',
    description: 'Resolves the reporting line and holds it, so a later department change cannot move a request already in flight.',
  })
  @ApiOkResponse()
  @RequirePermission('stamp:request')
  @GlobalScope()
  @Patch(':id/submit')
  submit(@Param('id') id: string, @Request() req: any) {
    return this.svc.submit(id, req.user.userId);
  }

  @ApiOperation({ summary: 'Take the request back' })
  @ApiOkResponse()
  @RequirePermission('stamp:request')
  @GlobalScope()
  @Patch(':id/withdraw')
  withdraw(@Param('id') id: string, @Request() req: any) {
    return this.svc.withdraw(id, req.user.userId);
  }

  @ApiOperation({
    summary: 'Move the request on',
    description: "Reviews it if you are the requester's line manager and it is awaiting review; releases the seal if you are the unit head and it is awaiting approval.",
  })
  @ApiOkResponse()
  @RequirePermission('stamp:review')
  @GlobalScope()
  @Patch(':id/approve')
  advance(@Param('id') id: string, @Body() dto: NoteDto, @Request() req: any) {
    return this.svc.advance(id, req.user.userId, dto.note ?? undefined);
  }

  @ApiOperation({ summary: 'Send it back to the requester' })
  @ApiOkResponse()
  @RequirePermission('stamp:review')
  @GlobalScope()
  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: NoteDto, @Request() req: any) {
    return this.svc.reject(id, req.user.userId, dto.note ?? undefined);
  }
}
