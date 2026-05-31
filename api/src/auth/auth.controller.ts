import { Body, Controller, Get, HttpCode, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IamService } from '../iam/iam.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly svc: AuthService,
    private readonly iam: IamService,
  ) {}

  @Public()
  @ApiOperation({ summary: 'Obtain a JWT access token' })
  @ApiOkResponse({ type: TokenResponseDto })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.svc.login(dto.username, dto.password);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the current user identity and effective GLOBAL permissions',
    description: 'Used by the portal to gate UI actions. Returns GLOBAL-scoped permission codes; ' +
      'scope-narrowed permissions (e.g. ENTITY-scoped cert:issue) are still enforced server-side per request.',
  })
  @Get('me')
  async me(@Request() req: any) {
    const userId: string | undefined = req.user?.userId;
    const permissions = userId ? await this.iam.getEffectivePermissions(userId) : [];
    return {
      userId: userId ?? null,
      username: req.user?.username ?? null,
      permissions,
    };
  }
}
