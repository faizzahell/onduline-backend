import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

vi.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authServiceMock }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('forwards the login credentials to the service', async () => {
    const credentials = { email: 'admin@ofda.local', password: 'Admin123!' };
    authServiceMock.login.mockResolvedValue({ accessToken: 'token' });

    await controller.login(credentials);

    expect(authServiceMock.login).toHaveBeenCalledWith(credentials);
  });

  it('forwards the refresh token to the service', async () => {
    await controller.refresh({ refreshToken: 'rt' });

    expect(authServiceMock.refresh).toHaveBeenCalledWith('rt');
  });

  it('forwards the logout to the service', async () => {
    await controller.logout({ refreshToken: 'rt' });

    expect(authServiceMock.logout).toHaveBeenCalledWith('rt');
  });

  it('reads the profile from the token user, not from client input', async () => {
    const user: AuthenticatedUser = {
      id: 'user-1',
      email: 'finance@ofda.local',
      roles: ['FINANCE'],
    };

    await controller.me(user);

    expect(authServiceMock.getProfile).toHaveBeenCalledWith('user-1');
  });
});
