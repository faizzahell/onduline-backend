import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { provisionCompanyMasterData } from './company-master-data';
import type { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import type { UpdateOcrSettingsDto } from './dto/update-ocr-settings.dto';

const companySelect = {
  id: true,
  code: true,
  name: true,
  currency: true,
  isActive: true,
  ocrInvoiceEnabled: true,
  ocrExpenseEnabled: true,
  accruedAccountNo: true,
  accruedAccountName: true,
  bankAccountNo: true,
  bankAccountName: true,
  journalInitials: true,
  pettyCashJournalInitials: true,
  accrualAreaCode: true,
} as const;

@Injectable()
export class CompanySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every company with its settings, for the super administrator screen. */
  async listAll() {
    return this.prisma.company.findMany({
      orderBy: { code: 'asc' },
      select: companySelect,
    });
  }

  async findOne(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: companySelect,
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  /**
   * Creates a company and fills it with the starting master data, then grants
   * the creating super administrator access to it so they can switch in right
   * away.
   */
  async create(creatorUserId: string, dto: CreateCompanyDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.company.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Company code ${code} is already in use`);
    }

    const companyId = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          code,
          name: dto.name.trim(),
          currency: dto.currency?.trim() || 'IDR',
          journalInitials: dto.journalInitials?.trim() || 'IS',
          pettyCashJournalInitials:
            dto.pettyCashJournalInitials?.trim() || 'RE',
          bankAccountNo: dto.bankAccountNo?.trim() || null,
          bankAccountName: dto.bankAccountName?.trim() || null,
        },
        select: { id: true },
      });

      await provisionCompanyMasterData(tx, company.id);

      // The first company a super administrator creates becomes their default
      // so the app has something active to show immediately.
      const hasDefault = await tx.userCompanyAccess.findFirst({
        where: { userId: creatorUserId, isDefault: true },
        select: { userId: true },
      });

      await tx.userCompanyAccess.create({
        data: {
          userId: creatorUserId,
          companyId: company.id,
          isDefault: !hasDefault,
        },
      });

      return company.id;
    });

    return this.findOne(companyId);
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    await this.findOne(companyId);

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.currency !== undefined
          ? { currency: dto.currency.trim() }
          : {}),
        ...(dto.journalInitials !== undefined
          ? { journalInitials: dto.journalInitials.trim() }
          : {}),
        ...(dto.pettyCashJournalInitials !== undefined
          ? { pettyCashJournalInitials: dto.pettyCashJournalInitials.trim() }
          : {}),
        ...(dto.bankAccountNo !== undefined
          ? { bankAccountNo: dto.bankAccountNo.trim() || null }
          : {}),
        ...(dto.bankAccountName !== undefined
          ? { bankAccountName: dto.bankAccountName.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: companySelect,
    });
  }

  /**
   * Deletes a company and everything scoped to it.
   *
   * Most relations cascade from `Company`, but the records that reference
   * `companyId` through a nullable, non-cascading link (expense entries,
   * claims, journal batches, OCR jobs, invoices) are cleared first so the
   * delete cannot fail on a foreign key.
   */
  async remove(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await clearCompanyScopedData(tx, companyId);
      await tx.company.delete({ where: { id: companyId } });
    });

    return { message: 'Company deleted' };
  }

  /**
   * Enables or disables OCR for a company.
   *
   * Turning OCR off deletes nothing: documents that were already extracted
   * stay intact, only the path for new extractions is closed.
   */
  async updateOcrSettings(companyId: string, dto: UpdateOcrSettingsDto) {
    await this.findOne(companyId);

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        ocrInvoiceEnabled: dto.ocrInvoiceEnabled,
        ocrExpenseEnabled: dto.ocrExpenseEnabled,
      },
      select: companySelect,
    });
  }
}

/**
 * Removes every transactional and master record that belongs to a company,
 * in foreign-key-safe order, but leaves the `Company` row itself in place.
 *
 * Shared by company deletion and the "clear by company" maintenance action.
 */
export async function clearCompanyScopedData(
  tx: {
    [
      K in
        | 'bcJournalBatch'
        | 'expenseOcrJob'
        | 'expenseEntry'
        | 'expenseClaim'
        | 'pettyCashBatch'
        | 'cashAdvance'
        | 'invoice'
        | 'employee'
        | 'expenseCategory'
        | 'areaCode'
        | 'department'
        | 'salesArea'
        | 'marketingCode'
        | 'approvalRule'
        | 'documentSequence'
        | 'userCompanyAccess'
    ]: {
      deleteMany: (args: {
        where: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  },
  companyId: string,
): Promise<void> {
  const where = { companyId };

  // Transactional documents first. Journal batches reference claims/batches
  // with SetNull, so dropping them up front avoids dangling links.
  await tx.bcJournalBatch.deleteMany({ where });
  await tx.expenseOcrJob.deleteMany({ where });
  await tx.expenseEntry.deleteMany({ where });
  await tx.expenseClaim.deleteMany({ where });
  await tx.pettyCashBatch.deleteMany({ where });
  await tx.cashAdvance.deleteMany({ where });
  await tx.invoice.deleteMany({ where });

  // Master data. Employees reference departments/areas, so employees go first.
  await tx.employee.deleteMany({ where });
  await tx.expenseCategory.deleteMany({ where });
  await tx.approvalRule.deleteMany({ where });
  await tx.department.deleteMany({ where });
  await tx.areaCode.deleteMany({ where });
  await tx.salesArea.deleteMany({ where });
  await tx.marketingCode.deleteMany({ where });
  await tx.documentSequence.deleteMany({ where });

  // Finally the access grants that tie users to this company.
  await tx.userCompanyAccess.deleteMany({ where });
}
