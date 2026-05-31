import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditEvent } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

// Constant-time dummy hash prevents timing attacks when username does not exist.
// bcrypt.compare always runs the full KDF regardless of the outcome.
const TIMING_SAFE_DUMMY = '$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Vb3zeFrPgH5IXVE';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    // Always run bcrypt.compare to prevent timing-based username enumeration.
    const hash = user?.passwordHash ?? TIMING_SAFE_DUMMY;
    const credentialsValid = await bcrypt.compare(password, hash);

    if (!user || !user.isActive || !credentialsValid) {
      await this.prisma.auditLog.create({
        data: {
          event: AuditEvent.LOGIN_FAILED,
          userId: user?.id,
          detail: { username },
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const expiresIn = process.env.JWT_EXPIRES_IN ?? '24h';
    const accessToken = this.jwt.sign(
      { sub: username, userId: user.id, username },
      { expiresIn },
    );
    const expiresInSeconds = expiresIn.endsWith('h')
      ? parseInt(expiresIn) * 3600
      : parseInt(expiresIn);

    await this.prisma.auditLog.create({
      data: {
        event: AuditEvent.LOGIN_SUCCESS,
        userId: user.id,
        detail: { username },
      },
    });

    return { accessToken, expiresIn: expiresInSeconds };
  }
}
