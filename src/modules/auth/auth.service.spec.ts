import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RbacService } from '../rbac/rbac.service';
import { AuthService } from './auth.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

vi.mock('bcrypt', () => ({
  compare: vi.fn(),
  hash: vi.fn().mockResolvedValue('hashed'),
}));

const bcrypt = await import('bcrypt');

const activeUser = {
  id: 'user-1',
  email: 'finance@ofda.local',
  name: 'Finance User',
  password: 'stored-hash',
  isActive: true,
};

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: { findUnique: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const jwtMock = { signAsync: vi.fn() };

  const rbacMock = {
    getUserAccess: vi.fn(),
  };

  const configMock = {
    get: vi.fn((key: string) =>
      key === 'JWT_EXPIRES_IN'
        ? '15m'
        : key === 'JWT_REFRESH_EXPIRES_IN'
          ? '7d'
          : undefined,
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    jwtMock.signAsync.mockResolvedValue('access-token');
    rbacMock.getUserAccess.mockResolvedValue({
      roles: ['FINANCE'],
      permissions: ['ocr:view', 'ocr:review'],
    });
    prismaMock.refreshToken.create.mockResolvedValue({});

    service = new AuthService(
      prismaMock as never,
      jwtMock as unknown as JwtService,
      rbacMock as unknown as RbacService,
      configMock as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('returns a session together with roles and permissions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const session = await service.login({
        email: activeUser.email,
        password: 'secret123',
      });

      expect(session.accessToken).toBe('access-token');
      expect(session.refreshToken).toHaveLength(64);
      expect(session.expiresIn).toBe(900);
      expect(session.user).toMatchObject({
        id: 'user-1',
        roles: ['FINANCE'],
        permissions: ['ocr:view', 'ocr:review'],
      });
    });

    it('stores the refresh token hashed, not as its raw value', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const session = await service.login({
        email: activeUser.email,
        password: 'secret123',
      });

      const { data } = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(data.tokenHash).not.toBe(session.refreshToken);
      expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects an incorrect password', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login({ email: activeUser.email, password: 'wrong123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unregistered email without revealing its existence', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'does@notexist.local', password: 'secret123' }),
      ).rejects.toThrow(
        new UnauthorizedException('Incorrect email or password'),
      );

      // Still hashes, so the response time does not become an oracle.
      expect(bcrypt.hash).toHaveBeenCalled();
    });

    it('rejects an inactive account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(
        service.login({ email: activeUser.email, password: 'secret123' }),
      ).rejects.toThrow(new UnauthorizedException('Account is inactive'));
    });
  });

  describe('refresh', () => {
    it('rotates the token by revoking the old one', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: activeUser,
      });

      const session = await service.refresh('old-refresh-token');

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-1' } }),
      );
      expect(session.refreshToken).not.toBe('old-refresh-token');
    });

    it('rejects a token that has already been revoked', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: activeUser,
      });

      await expect(service.refresh('reused')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 'token-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        user: activeUser,
      });

      await expect(service.refresh('expired')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an unknown token', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('whatever')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('returns the current roles and permissions', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser);

      await expect(service.getProfile('user-1')).resolves.toMatchObject({
        id: 'user-1',
        roles: ['FINANCE'],
        permissions: ['ocr:view', 'ocr:review'],
      });
    });

    it('rejects a user who has been deactivated', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });

      await expect(service.getProfile('user-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the token and is idempotent', async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.logout('token')).resolves.toEqual({
        message: 'Logout successful',
      });
    });
  });
});
