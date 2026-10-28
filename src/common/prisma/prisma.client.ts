import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../generated/prisma/client';

/**
 * Standalone Prisma client for scripts that run outside Nest, such as
 * `prisma/seed.ts`. Application code should inject `PrismaService` instead of
 * using this.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set in the environment');
}

// A real pool is passed to the adapter so each interactive transaction gets
// its own dedicated client, which avoids the pg "client is already executing a
// query" deprecation warning.
export const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
});
