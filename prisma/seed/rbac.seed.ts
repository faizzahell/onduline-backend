import * as bcrypt from 'bcrypt';

import { prisma } from '../../src/common/prisma/prisma.client';

const BCRYPT_ROUNDS = 12;

interface PermissionSeed {
  code: string;
  module: string;
  description: string;
}

/**
 * Every permission listed here must actually be used by an endpoint.
 * See the `@Permissions()` decorators on the controllers for the mapping.
 */
export const permissions: PermissionSeed[] = [
  {
    code: 'user:manage',
    module: 'USER',
    description: 'Manage users and roles',
  },

  // The two company-wide switches below are deliberately granted to no role.
  // Only SUPER_ADMINISTRATOR reaches them, through the bypass in RbacService,
  // which is what keeps them out of ADMINISTRATOR's hands.
  {
    code: 'company:manage',
    module: 'COMPANY',
    description: 'Configure companies, including turning OCR on or off',
  },
  {
    code: 'company:switch',
    module: 'COMPANY',
    description: 'Move the active company from one legal entity to another',
  },

  // OCR Accounts Payable
  {
    code: 'ocr:upload',
    module: 'OCR',
    description:
      'Upload invoices, correct extraction results, and delete invoices',
  },
  {
    code: 'ocr:view',
    module: 'OCR',
    description: 'View OCR invoice data and its jobs',
  },
  {
    code: 'ocr:match',
    module: 'OCR',
    description: 'Perform 3-way matching of invoice, PO, and GRN',
  },
  {
    code: 'ocr:resolve_po',
    module: 'OCR',
    description: 'Search for and link a Purchase Order to an invoice',
  },
  {
    code: 'ocr:submit_bc',
    module: 'OCR',
    description: 'Submit invoices to Business Central',
  },
  {
    code: 'ocr:grn_view',
    module: 'OCR',
    description: 'View GRN / Posted Purchase Receipts data',
  },
  {
    code: 'ocr:assign_gl',
    module: 'OCR',
    description: 'Allocate GL accounts and dimensions',
  },
  {
    code: 'ocr:review',
    module: 'OCR',
    description: 'Correct and validate invoice extraction results',
  },
  {
    code: 'ocr:post_bc',
    module: 'OCR',
    description: 'Post invoices in Business Central',
  },

  // Expense Management
  {
    code: 'expense:entry',
    module: 'EXPENSE',
    description: 'Record and submit your own expense claims',
  },
  {
    code: 'expense:view',
    module: 'EXPENSE',
    description: 'View your own expense claims',
  },
  {
    code: 'expense:view_all',
    module: 'EXPENSE',
    description: 'View expense claims of all employees',
  },
  {
    code: 'expense:approve',
    module: 'EXPENSE',
    description: 'Review, approve, and revise claim amounts',
  },
  {
    code: 'expense:accrue',
    module: 'EXPENSE',
    description: 'Create accrual journals for claims in Business Central',
  },
  {
    code: 'expense:post',
    module: 'EXPENSE',
    description: 'Post accrual reversals and claim payments',
  },
  {
    code: 'expense:master',
    module: 'EXPENSE',
    description:
      'Manage master data for categories, rates, dimensions, and employees',
  },
  {
    code: 'expense:report',
    module: 'EXPENSE',
    description: 'Access expense reports and dashboards',
  },

  // Petty cash
  {
    code: 'pettycash:entry',
    module: 'PETTY_CASH',
    description: 'Record and submit petty cash batches',
  },
  {
    code: 'pettycash:approve',
    module: 'PETTY_CASH',
    description: 'Approve petty cash batches',
  },
  {
    code: 'pettycash:post',
    module: 'PETTY_CASH',
    description: 'Post petty cash batches to Business Central',
  },

  // Cash advance
  {
    code: 'advance:request',
    module: 'ADVANCE',
    description: 'Request a cash advance',
  },
  {
    code: 'advance:approve',
    module: 'ADVANCE',
    description: 'Approve a cash advance',
  },
  {
    code: 'advance:post',
    module: 'ADVANCE',
    description: 'Post and settle a cash advance',
  },
];

/** Permissions that belong to the super administrator and to nobody else. */
const SUPER_ADMINISTRATOR_ONLY = ['company:manage', 'company:switch'];

const roles = [
  {
    name: 'SUPER_ADMINISTRATOR',
    description:
      'Unrestricted access. The only role that can open OCR access per company and move the active company between legal entities.',
  },
  {
    name: 'ADMINISTRATOR',
    description:
      'Full access to the functional menus, the Business Central API configuration, user management, and the system log. Cannot change company-wide switches.',
  },
  {
    name: 'PURCHASER',
    description:
      'Uploads invoices, verifies OCR results, performs matching, and submits invoices to Business Central.',
  },
  {
    name: 'WAREHOUSE',
    description:
      'Views goods receipt status through GRN or Posted Purchase Receipts.',
  },
  {
    name: 'FINANCE',
    description:
      'Allocates GL accounts and handles review, accrual, and posting of purchase invoices as well as expenses.',
  },
  {
    name: 'EMPLOYEE',
    description: 'All employees: record and submit their own expense claims.',
  },
  {
    name: 'EXPENSE_APPROVER',
    description:
      'Supervisors who review and approve expense claims, petty cash, and cash advances.',
  },
  {
    name: 'HR',
    description: 'Requests the annual advance for employees.',
  },
];

/**
 * SUPER_ADMINISTRATOR is intentionally left out: `RbacService` lets it through
 * for every permission. ADMINISTRATOR is listed explicitly and receives every
 * permission except the super-administrator-only ones.
 */
const rolePermissions: Record<string, string[]> = {
  ADMINISTRATOR: permissions
    .map((permission) => permission.code)
    .filter((code) => !SUPER_ADMINISTRATOR_ONLY.includes(code)),
  PURCHASER: [
    'ocr:upload',
    'ocr:view',
    'ocr:match',
    'ocr:resolve_po',
    'ocr:submit_bc',
  ],
  WAREHOUSE: ['ocr:grn_view'],
  FINANCE: [
    'ocr:view',
    'ocr:review',
    'ocr:assign_gl',
    'ocr:post_bc',
    'ocr:submit_bc',
    'expense:entry',
    'expense:view',
    'expense:view_all',
    'expense:approve',
    'expense:accrue',
    'expense:post',
    'expense:master',
    'expense:report',
    'pettycash:entry',
    'pettycash:post',
    'advance:post',
  ],
  EMPLOYEE: ['expense:entry', 'expense:view'],
  EXPENSE_APPROVER: [
    'expense:view',
    'expense:view_all',
    'expense:approve',
    'expense:report',
    'pettycash:approve',
    'advance:approve',
  ],
  HR: ['advance:request', 'expense:view_all'],
};

export interface SeededUser {
  roleName: string;
  email: string;
  name: string;
  /** Employee code used when the account also gets an employee record. */
  employeeCode: string;
  position: string;
  level: 'STAFF' | 'MANAGER' | 'DIRECTOR';
  division: 'SALES' | 'NON_SALES';
  departmentCode: string;
  userId: string;
}

type UserSeed = Omit<SeededUser, 'userId'>;

/**
 * One demo account per role, so every path through the application can be
 * tried without hand-building users first.
 *
 * The password is shared across all seeded accounts and can be overridden
 * with `SEED_DEFAULT_PASSWORD`.
 */
const userSeeds: UserSeed[] = [
  {
    roleName: 'SUPER_ADMINISTRATOR',
    email: 'superadmin@ofda.local',
    name: 'Super Administrator',
    employeeCode: 'SPA',
    position: 'System Owner',
    level: 'DIRECTOR',
    division: 'NON_SALES',
    departmentCode: 'FINANCE',
  },
  {
    roleName: 'ADMINISTRATOR',
    email: 'admin@ofda.local',
    name: 'Administrator',
    employeeCode: 'ADM',
    position: 'System Administrator',
    level: 'DIRECTOR',
    division: 'NON_SALES',
    departmentCode: 'FINANCE',
  },
  {
    roleName: 'PURCHASER',
    email: 'purchaser@ofda.local',
    name: 'Purchasing Officer',
    employeeCode: 'PUR',
    position: 'Purchasing Staff',
    level: 'STAFF',
    division: 'NON_SALES',
    departmentCode: 'COMMERCIAL',
  },
  {
    roleName: 'WAREHOUSE',
    email: 'warehouse@ofda.local',
    name: 'Warehouse Officer',
    employeeCode: 'WHS',
    position: 'Warehouse Staff',
    level: 'STAFF',
    division: 'NON_SALES',
    departmentCode: 'PRODUCT',
  },
  {
    roleName: 'FINANCE',
    email: 'finance@ofda.local',
    name: 'Finance Officer',
    employeeCode: 'FIN',
    position: 'Finance & Accounting Staff',
    level: 'STAFF',
    division: 'NON_SALES',
    departmentCode: 'FINANCE',
  },
  {
    roleName: 'EMPLOYEE',
    email: 'employee@ofda.local',
    name: 'Sales Employee',
    employeeCode: 'EMP',
    position: 'Sales Representative',
    level: 'STAFF',
    division: 'SALES',
    departmentCode: 'COMMERCIAL',
  },
  {
    roleName: 'EXPENSE_APPROVER',
    email: 'approver@ofda.local',
    name: 'Expense Approver',
    employeeCode: 'APR',
    position: 'Commercial Director',
    level: 'DIRECTOR',
    division: 'NON_SALES',
    departmentCode: 'COMMERCIAL',
  },
  {
    roleName: 'HR',
    email: 'hr@ofda.local',
    name: 'HR Officer',
    employeeCode: 'HRD',
    position: 'HR & GA Staff',
    level: 'STAFF',
    division: 'NON_SALES',
    departmentCode: 'HR_LEGAL_GA',
  },
];

export async function seedPermissions(): Promise<void> {
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        description: permission.description,
      },
      create: permission,
    });
  }
}

export async function seedRoles(): Promise<void> {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
}

export async function seedRolePermissions(): Promise<void> {
  for (const [roleName, permissionCodes] of Object.entries(rolePermissions)) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });

    const granted = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    if (granted.length !== permissionCodes.length) {
      throw new Error(
        `Some permissions for role ${roleName} were not found in the Permission table`,
      );
    }

    for (const permission of granted) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    // Revoke permissions that have been removed from the list above.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: granted.map((item) => item.id) },
      },
    });
  }

  // SUPER_ADMINISTRATOR holds no explicit grants: it passes through the
  // bypass. Any row left over from an earlier seed is cleared.
  const superAdministrator = await prisma.role.findUniqueOrThrow({
    where: { name: 'SUPER_ADMINISTRATOR' },
  });

  await prisma.rolePermission.deleteMany({
    where: { roleId: superAdministrator.id },
  });
}

/**
 * Creates the single super administrator account.
 *
 * Nothing else is seeded: companies, their master data, and every other user
 * are created at runtime by the super administrator through the UI. This keeps
 * a fresh database to exactly one usable login.
 */
export async function seedSuperAdministrator(): Promise<{ userId: string }> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'superadmin@ofda.local';
  const password =
    process.env.SEED_DEFAULT_PASSWORD ??
    process.env.SEED_ADMIN_PASSWORD ??
    'Admin123!';

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const role = await prisma.role.findUniqueOrThrow({
    where: { name: 'SUPER_ADMINISTRATOR' },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Super Administrator',
      password: passwordHash,
      isActive: true,
    },
    create: { email, name: 'Super Administrator', password: passwordHash },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`Super administrator ready: ${email} (password "${password}")`);

  return { userId: user.id };
}

/**
 * Creates one account per role and returns them with their user ids.
 *
 * No longer part of the default seed; kept for tests and for optional demo
 * data via `SEED_DEMO_USERS=true`.
 */
export async function seedUsers(): Promise<SeededUser[]> {
  const password =
    process.env.SEED_DEFAULT_PASSWORD ??
    process.env.SEED_ADMIN_PASSWORD ??
    'Admin123!';

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const seeded: SeededUser[] = [];

  for (const seed of userSeeds) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: seed.roleName },
    });

    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { name: seed.name, password: passwordHash, isActive: true },
      create: { email: seed.email, name: seed.name, password: passwordHash },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    seeded.push({ ...seed, userId: user.id });
  }

  console.log(
    `Seeded ${seeded.length} accounts, one per role, all with password "${password}":`,
  );

  for (const user of seeded) {
    console.log(`  - ${user.roleName.padEnd(20)} ${user.email}`);
  }

  return seeded;
}
