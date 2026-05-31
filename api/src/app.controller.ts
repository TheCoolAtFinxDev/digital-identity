import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/public.decorator';
import { AppService } from './app.service';

@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly svc: AppService) {}

  @Public()
  @ApiTags('health')
  @ApiOperation({ summary: 'Service health check' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  @Get('/health')
  health() {
    return this.svc.health();
  }
}
