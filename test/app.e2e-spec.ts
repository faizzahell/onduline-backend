import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HealthController } from '../src/common/health/health.controller';
import { PrismaService } from '../src/common/prisma/prisma.service';

vi.mock('../src/common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * Exercises the HTTP surface (global prefix and validation pipe) without
 * needing Postgres or Redis, so it can run in CI without any infrastructure.
 * A full end-to-end test requires a real database.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  const prismaMock = { $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns status ok', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });

  it('GET /health without the prefix returns 404', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
