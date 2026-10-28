import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

vi.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('HealthController', () => {
  let controller: HealthController;

  const prismaMock = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('reports an ok status when the database is reachable', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);

    await expect(controller.check()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
      service: 'ofda-backend',
    });
  });

  it('throws a 503 when the database is unreachable', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
