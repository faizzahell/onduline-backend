import { prisma } from '../src/common/prisma/prisma.client';
import {
  seedPermissions,
  seedRolePermissions,
  seedRoles,
  seedSuperAdministrator,
} from './seed/rbac.seed';

/**
 * A fresh database starts with just the RBAC definitions and one super
 * administrator. Companies, their master data, and every other user are
 * created at runtime by the super administrator through the application.
 */
async function main(): Promise<void> {
  console.log('Seeding roles and permissions...');

  await seedPermissions();
  await seedRoles();
  await seedRolePermissions();

  await seedSuperAdministrator();

  console.log('Seed finished.');
  console.log(
    'Sign in as the super administrator, then create your first company from Settings before using the rest of the app.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
