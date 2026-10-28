import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { SUPER_ADMINISTRATOR_ROLE } from '../rbac/rbac.service';
import { clearCompanyScopedData } from './company-settings.service';
import type { ClearDatabaseDto } from './dto/clear-database.dto';

/** The phrase the client must echo to confirm a destructive clear. */
export const CLEAR_CONFIRMATION = 'CLEAR';

@Injectable()
export class DatabaseMaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Development helper that wipes data, either everything or a single
   * company's slice.
   *
   * `all` empties every company plus all non-super-administrator users and
   * their companies, leaving only the super administrator accounts and the
   * RBAC definitions (roles and permissions) intact so the app is still
   * usable. `company` keeps the company row but clears its data and removes
   * the users that could only reach that company.
   */
  async clear(dto: ClearDatabaseDto) {
    if (dto.confirm !== CLEAR_CONFIRMATION) {
      throw new BadRequestException(
        `Type "${CLEAR_CONFIRMATION}" to confirm this destructive action`,
      );
    }

    if (dto.scope === 'company') {
      return this.clearCompany(dto.companyId!);
    }

    return this.clearAll();
  }

  private async clearAll() {
    const removedStorage = await this.wipeStorage();

    const counts = await this.prisma.$transaction(async (tx) => {
      // Transactional documents across every company.
      await tx.bcJournalBatch.deleteMany({});
      await tx.expenseOcrJob.deleteMany({});
      await tx.expenseEntry.deleteMany({});
      await tx.expenseClaim.deleteMany({});
      await tx.pettyCashBatch.deleteMany({});
      await tx.cashAdvance.deleteMany({});
      await tx.invoice.deleteMany({});

      // Master data.
      await tx.employee.deleteMany({});
      await tx.expenseCategory.deleteMany({});
      await tx.approvalRule.deleteMany({});
      await tx.department.deleteMany({});
      await tx.areaCode.deleteMany({});
      await tx.salesArea.deleteMany({});
      await tx.marketingCode.deleteMany({});
      await tx.documentSequence.deleteMany({});

      // Non-super-administrator accounts. Their role and access rows cascade
      // from the user delete.
      const removableUsers = await tx.user.findMany({
        where: {
          roles: {
            none: { role: { name: SUPER_ADMINISTRATOR_ROLE } },
          },
        },
        select: { id: true },
      });

      const userIds = removableUsers.map((user) => user.id);

      if (userIds.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }

      // Every company grant for the remaining (super admin) users goes too,
      // because the companies themselves are being removed.
      await tx.userCompanyAccess.deleteMany({});

      const companies = await tx.company.count();
      await tx.company.deleteMany({});

      return { companies, users: userIds.length };
    });

    return {
      message: 'All data cleared. Super administrator accounts were kept.',
      scope: 'all' as const,
      deleted: { ...counts, storageFiles: removedStorage },
    };
  }

  private async clearCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, code: true, name: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const removedStorage = await this.wipeStorage();

    const removedUsers = await this.prisma.$transaction(async (tx) => {
      // Users whose only company is this one are removed; users who can reach
      // another company (a super administrator, typically) keep their account
      // and just lose this grant via clearCompanyScopedData.
      const candidates = await tx.userCompanyAccess.findMany({
        where: { companyId },
        select: { userId: true },
      });

      await clearCompanyScopedData(tx, companyId);

      let removed = 0;

      for (const { userId } of candidates) {
        const otherAccess = await tx.userCompanyAccess.count({
          where: { userId },
        });
        const isSuperAdmin = await tx.userRole.count({
          where: { userId, role: { name: SUPER_ADMINISTRATOR_ROLE } },
        });

        if (otherAccess === 0 && isSuperAdmin === 0) {
          await tx.user.delete({ where: { id: userId } });
          removed += 1;
        }
      }

      return removed;
    });

    return {
      message: `Data for ${company.name} (${company.code}) cleared.`,
      scope: 'company' as const,
      company,
      deleted: { users: removedUsers, storageFiles: removedStorage },
    };
  }

  /**
   * Snapshot of a single company's data, for the export download.
   *
   * It bundles the company row, its master data, and its transactional
   * documents into one JSON object the client saves to a file.
   */
  async exportCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const where = { companyId };

    const [
      employees,
      categories,
      areaCodes,
      departments,
      salesAreas,
      marketingCodes,
      approvalRules,
      invoices,
      expenseEntries,
      expenseClaims,
      pettyCashBatches,
      cashAdvances,
      journalBatches,
      users,
    ] = await Promise.all([
      this.prisma.employee.findMany({ where }),
      this.prisma.expenseCategory.findMany({
        where,
        include: { rates: true },
      }),
      this.prisma.areaCode.findMany({ where }),
      this.prisma.department.findMany({ where }),
      this.prisma.salesArea.findMany({ where }),
      this.prisma.marketingCode.findMany({ where }),
      this.prisma.approvalRule.findMany({ where, include: { steps: true } }),
      this.prisma.invoice.findMany({
        where,
        include: { lines: true, files: true },
      }),
      this.prisma.expenseEntry.findMany({
        where,
        include: {
          attachments: true,
          entertainment: true,
          mealAllowance: true,
        },
      }),
      this.prisma.expenseClaim.findMany({ where }),
      this.prisma.pettyCashBatch.findMany({
        where,
        include: { entries: true },
      }),
      this.prisma.cashAdvance.findMany({ where }),
      this.prisma.bcJournalBatch.findMany({ where, include: { lines: true } }),
      this.prisma.user.findMany({
        where: { companyAccess: { some: { companyId } } },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      company,
      users: users.map((user) => ({
        ...user,
        roles: user.roles.map((userRole) => userRole.role.name),
      })),
      masterData: {
        employees,
        categories,
        areaCodes,
        departments,
        salesAreas,
        marketingCodes,
        approvalRules,
      },
      transactions: {
        invoices,
        expenseEntries,
        expenseClaims,
        pettyCashBatches,
        cashAdvances,
        journalBatches,
      },
    };
  }

  /**
   * Clears the on-disk uploads. The clear is a development reset, so the whole
   * storage tree goes; a missing directory is not an error.
   */
  private async wipeStorage(): Promise<boolean> {
    try {
      await rm(join(process.cwd(), 'storage'), {
        recursive: true,
        force: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}
