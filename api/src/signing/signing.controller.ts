import { Body, Controller, Get, HttpCode, Param, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../iam/permission.decorator';
import { SignDto } from './dto/sign.dto';
import { VerifySignatureDto } from './dto/verify-signature.dto';
import { SigningService } from './signing.service';

@ApiTags('signing')
@ApiBearerAuth()
@Controller('v1/signatures')
export class SigningController {
  constructor(private readonly svc: SigningService) {}

  @RequirePermission('signature:create')
  @ApiOperation({ summary: 'Sign content with an entity\'s HSM-held key' })
  @ApiCreatedResponse()
  @HttpCode(201)
  @Post()
  sign(@Body() dto: SignDto, @Request() req: any) {
    return this.svc.sign(dto, req.user?.userId);
  }

  @RequirePermission('signature:read')
  @ApiOperation({ summary: 'Verify a signature against an entity/certificate key + revocation status' })
  @ApiOkResponse()
  @HttpCode(200)
  @Post('verify')
  verify(@Body() dto: VerifySignatureDto, @Request() req: any) {
    return this.svc.verify(dto, req.user?.userId);
  }

  @RequirePermission('signature:read')
  @ApiOperation({ summary: 'List signature records produced for an entity' })
  @ApiOkResponse()
  @Get('entity/:entityId')
  listForEntity(@Param('entityId') entityId: string) {
    return this.svc.listForEntity(entityId);
  }
}
