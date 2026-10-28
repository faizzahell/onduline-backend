import type { Prisma } from '../../generated/prisma/client';

/**
 * The Prisma client inside an interactive transaction.
 *
 * Services that can be called either standalone or as part of someone else's
 * transaction accept this type, which leaves the caller in control of the
 * transaction boundary.
 */
export type PrismaTransactionClient = Prisma.TransactionClient;
