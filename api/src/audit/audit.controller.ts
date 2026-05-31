import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditLogPageDto } from './dto/audit-log-response.dto';
import { RequirePermission } from '../iam/permission.decorator';

// Audit is a read-only, permission-gated endpoint consumed by the portal's
// audit dashboard (filtering + pagination). The default 10 req/60s global limit
// is too tight for interactive browsing, so this handler gets a higher ceiling.
// This does NOT affect the login throttle (a separate handler at the default).
@Throttle({ default: { limit: 120, ttl: 60000 } })
@ApiBearerAuth()
@ApiTags('audit')
@Controller('v1/audit-logs')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @ApiOperation({
    summary: 'Query audit log entries',
    description: 'Returns paginated audit log entries. Filterable by event type, request ID, entity ID, and date range.',
  })
  @ApiOkResponse({ type: AuditLogPageDto })
  @RequirePermission('audit:read')
  @Get()
  query(@Query() q: AuditQueryDto) {
    return this.svc.query(q);
  }
}
