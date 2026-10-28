import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { parseDurationToMs } from '../../common/utils/duration.util';
import { RbacService } from '../rbac/rbac.service';
import type { AuthProfile, AuthSession, JwtPayload } from './auth.types';
import type { LoginDto } from './dto/login.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password';
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly accessTokenTtlMs: number;
  private readonly refreshTokenTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rbacService: RbacService,
    configService: ConfigService,
  ) {
    this.accessTokenTtlMs = parseDurationToMs(
      configService.get<string>('JWT_EXPIRES_IN') || '15m',
    );

    this.refreshTokenTtlMs = parseDurationToMs(
      configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    );
  }

  async login(loginDto: LoginDto): Promise<AuthSession> {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({ where: { email } });

    // A dummy hash is compared when the user does not exist, so the login
    // response time does not reveal which emails are registered.
    const passwordValid = user
      ? await bcrypt.compare(password, user.password)
      : await this.compareAgainstDummyHash(password);

    if (!user || !passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return this.createSession(user.id, user.email, user.name);
  }

  /**
   * Exchanges a refresh token for a new session, then revokes the old token
   * (rotation). A reused token is rejected.
   */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.createSession(
      stored.user.id,
      stored.user.email,
      stored.user.name,
    );
  }

  /** Revokes a single refresh token. Idempotent. */
  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logout successful' };
  }

  /**
   * The user's current profile, roles, and permissions.
   *
   * The frontend calls this after a page reload so role changes take effect
   * right away instead of waiting for the access token to expire.
   */
  async getProfile(userId: string): Promise<AuthProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const { roles, permissions } = await this.rbacService.getUserAccess(userId);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
    };
  }

  private async createSession(
    userId: string,
    email: string,
    name: string,
  ): Promise<AuthSession> {
    const { roles, permissions } = await this.rbacService.getUserAccess(userId);

    const payload: JwtPayload = { sub: userId, email, roles };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.issueRefreshToken(userId),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(this.accessTokenTtlMs / 1000),
      user: { id: userId, email, name, roles, permissions },
    };
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
      },
    });

    return token;
  }

  /** Refresh tokens are stored hashed, so a database leak is not directly usable. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async compareAgainstDummyHash(password: string): Promise<boolean> {
    await bcrypt.hash(password, BCRYPT_ROUNDS);
    return false;
  }
}
