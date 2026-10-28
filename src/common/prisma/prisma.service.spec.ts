import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service';

const connectMock = vi.fn();
const disconnectMock = vi.fn();
const adapterConstructor = vi.fn();

vi.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {
    $connect = connectMock;
    $disconnect = disconnectMock;
  },
}));

const poolConstructor = vi.fn();
const poolEndMock = vi.fn();

vi.mock('pg', () => ({
  Pool: class {
    end = poolEndMock;
    constructor(config: { connectionString: string }) {
      poolConstructor(config);
    }
  },
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(pool: unknown) {
      adapterConstructor(pool);
    }
  },
}));

describe('PrismaService', () => {
  const configService = {
    getOrThrow: vi.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configService.getOrThrow).mockReturnValue(
      'postgresql://user:pass@localhost:5432/db',
    );
  });

  it('builds a pool from DATABASE_URL and hands it to the adapter', () => {
    new PrismaService(configService);

    expect(configService.getOrThrow).toHaveBeenCalledWith('DATABASE_URL');
    expect(poolConstructor).toHaveBeenCalledWith({
      connectionString: 'postgresql://user:pass@localhost:5432/db',
    });
    // The adapter receives the pool instance, not a bare connection string.
    expect(adapterConstructor).toHaveBeenCalledOnce();
    expect(adapterConstructor.mock.calls[0][0]).toBeInstanceOf(Object);
  });

  it('connects on init, then disconnects and closes the pool on destroy', async () => {
    const service = new PrismaService(configService);

    await service.onModuleInit();
    expect(connectMock).toHaveBeenCalledOnce();

    await service.onModuleDestroy();
    expect(disconnectMock).toHaveBeenCalledOnce();
    expect(poolEndMock).toHaveBeenCalledOnce();
  });
});
