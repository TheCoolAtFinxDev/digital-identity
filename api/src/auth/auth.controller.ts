import { Body, Controller, Get, HttpCode, Post, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IamService } from '../iam/iam.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { TokenRequestDto } from './dto/token-request.dto';
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
  @ApiOperation({ summary: 'Obtain a JWT access token (human login)' })
  @ApiOkResponse({ type: TokenResponseDto })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.svc.login(dto.username, dto.password);
  }

  @Public()
  @ApiOperation({ summary: 'OAuth2 client-credentials grant for service accounts (machine-to-machine)' })
  @HttpCode(200)
  @Post('token')
  token(@Body() dto: TokenRequestDto) {
    return this.svc.issueServiceToken(dto.clientId, dto.clientSecret);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the current principal identity and effective GLOBAL permissions',
    description: 'Used to gate actions. Works for both users and service accounts. Returns GLOBAL-scoped ' +
      'permission codes; scope-narrowed permissions are still enforced server-side per request.',
  })
  @Get('me')
  async me(@Request() req: any) {
    const principalType: string = req.user?.principalType ?? 'user';
    if (principalType === 'service' && req.user?.serviceAccountId) {
      const permissions = await this.iam.getServiceAccountPermissions(req.user.serviceAccountId);
      return {
        principalType,
        serviceAccountId: req.user.serviceAccountId,
        name: req.user?.name ?? null,
        permissions,
      };
    }
    const userId: string | undefined = req.user?.userId;
    const permissions = userId ? await this.iam.getEffectivePermissions(userId) : [];
    return { principalType: 'user', userId: userId ?? null, username: req.user?.username ?? null, permissions };
  }
}
