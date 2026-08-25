import { Controller, Get, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { GlobalScope } from '../iam/scope.decorator';
import { MeService } from './me.service';

/**
 * Everything here answers "what about me". None of these routes take an id —
 * the acting user is the query, which is also why they are not narrowable: there
 * is no target to scope against, and a person can only ever see their own feed.
 */
@ApiTags('staff-me')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(private readonly svc: MeService) {}

  @ApiOperation({ summary: 'One merged queue: documents to sign and stamp requests to act on' })
  @ApiOkResponse()
  @RequirePermission('document:read')
  @GlobalScope()
  @Get('awaiting')
  awaiting(@Request() req: any) {
    return this.svc.awaiting(req.user.userId);
  }

  @ApiOperation({ summary: 'Everything I have signed or had stamped' })
  @ApiOkResponse()
  @RequirePermission('document:read')
  @GlobalScope()
  @Get('documents')
  documents(@Request() req: any) {
    return this.svc.myDocuments(req.user.userId);
  }

  @ApiOperation({ summary: 'Documents I sent to other people, and who still owes a signature' })
  @ApiOkResponse()
  @RequirePermission('document:read')
  @GlobalScope()
  @Get('sent')
  sent(@Request() req: any) {
    return this.svc.sent(req.user.userId);
  }

  @ApiOperation({ summary: 'My stamp requests and where each one has got to' })
  @ApiOkResponse()
  @RequirePermission('document:read')
  @GlobalScope()
  @Get('stamp-requests')
  stampRequests(@Request() req: any) {
    return this.svc.myStampRequests(req.user.userId);
  }

  @ApiOperation({ summary: 'Who signs off for me, and what is blocking it if anything' })
  @ApiOkResponse()
  @RequirePermission('document:read')
  @GlobalScope()
  @Get('approval-chain')
  approvalChain(@Request() req: any) {
    return this.svc.approvalChain(req.user.userId);
  }
}
