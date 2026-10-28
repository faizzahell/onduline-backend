import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * A cryptographically valid token is not enough: the user may have been
   * deactivated or deleted after the token was issued, so their status is
   * rechecked on every request.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return {
      id: user.id,
      email: user.email,
      roles: payload.roles ?? [],
    };
  }
}
