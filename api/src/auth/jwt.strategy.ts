import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  userId?: string;
  username?: string;
  serviceAccountId?: string;
  principalType?: 'user' | 'service';
  name?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change_me_jwt_secret_must_be_long_and_random',
    });
  }

  async validate(payload: JwtPayload) {
    return {
      principalType: payload.principalType ?? 'user',
      userId: payload.userId,
      username: payload.username ?? payload.sub,
      serviceAccountId: payload.serviceAccountId,
      name: payload.name,
    };
  }
}
