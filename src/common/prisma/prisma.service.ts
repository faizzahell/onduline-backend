import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    // The adapter is given a real pool rather than a bare connection string.
    // With a connection string the adapter builds a pool internally, and under
    // pg 8 its transaction handling can reuse a client that still has a query
    // in flight, which prints the "client is already executing a query"
    // deprecation warning. An explicit pool hands each interactive transaction
    // its own dedicated client, so queries never overlap on one connection.
    const pool = new Pool({ connectionString });

    super({ adapter: new PrismaPg(pool) });

    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
