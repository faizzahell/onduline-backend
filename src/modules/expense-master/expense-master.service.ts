import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  CreateExpenseRateDto,
  UpsertDimensionDto,
  UpsertExpenseCategoryDto,
} from './dto/master-data.dto';

/** The BC dimension kinds managed through the same endpoint. */
export type DimensionKind =
  'departments' | 'area-codes' | 'sales-areas' | 'marketing-codes';

@Injectable()
export class ExpenseMasterService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  async listCategories(companyId: string, includeInactive = false) {
    return this.prisma.expenseCategory.findMany({
      where: {
        companyId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ parentId: 'asc' }, { code: 'asc' }],
      include: {
        parent: { select: { id: true, code: true, name: true } },
        rates: { orderBy: { effectiveFrom: 'desc' } },
      },
    });
  }

  async createCategory(companyId: string, dto: UpsertExpenseCategoryDto) {
    await this.assertCategoryCodeAvailable(companyId, dto.code);

    if (dto.parentId) {
      await this.assertCategoryExists(companyId, dto.parentId);
    }

    return this.prisma.expenseCategory.create({
      data: { companyId, ...dto },
    });
  }

  async updateCategory(
    companyId: string,
    id: string,
    dto: UpsertExpenseCategoryDto,
  ) {
    const category = await this.assertCategoryExists(companyId, id);

    if (dto.code !== category.code) {
      await this.assertCategoryCodeAvailable(companyId, dto.code);
    }

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }

      await this.assertCategoryExists(companyId, dto.parentId);
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * A category that has already been used is never deleted, only deactivated,
   * so reports for past periods can still show its name.
   */
  async deactivateCategory(companyId: string, id: string) {
    await this.assertCategoryExists(companyId, id);

    return this.prisma.expenseCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // -------------------------------------------------------------------------
  // Fixed rates
  // -------------------------------------------------------------------------

  /**
   * Adds a new rate and closes the validity period of the previous one.
   *
   * The amount of the old rate is left untouched, so past claims keep using
   * the rate that was in effect at the time.
   */
  async addCategoryRate(
    companyId: string,
    categoryId: string,
    dto: CreateExpenseRateDto,
  ) {
    await this.assertCategoryExists(companyId, categoryId);

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'The effective end date cannot be earlier than the start date',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.expenseRate.updateMany({
        where: { categoryId, effectiveTo: null },
        data: { effectiveTo: new Date(effectiveFrom.getTime() - 86_400_000) },
      });

      return tx.expenseRate.create({
        data: { categoryId, amount: dto.amount, effectiveFrom, effectiveTo },
      });
    });
  }

  /** The rate in effect on a given date. */
  async findEffectiveRate(categoryId: string, onDate: Date) {
    return this.prisma.expenseRate.findFirst({
      where: {
        categoryId,
        effectiveFrom: { lte: onDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  // -------------------------------------------------------------------------
  // Dimensions
  // -------------------------------------------------------------------------

  async listDimension(kind: DimensionKind, companyId: string) {
    switch (kind) {
      case 'departments':
        return this.prisma.department.findMany({
          where: { companyId },
          orderBy: { code: 'asc' },
          include: {
            headEmployee: {
              select: { id: true, name: true, employeeCode: true },
            },
          },
        });

      case 'area-codes':
        return this.prisma.areaCode.findMany({
          where: { companyId },
          orderBy: { code: 'asc' },
        });

      case 'sales-areas':
        return this.prisma.salesArea.findMany({
          where: { companyId },
          orderBy: { code: 'asc' },
          include: {
            managerEmployee: {
              select: { id: true, name: true, employeeCode: true },
            },
          },
        });

      case 'marketing-codes':
        return this.prisma.marketingCode.findMany({
          where: { companyId },
          orderBy: { code: 'asc' },
        });
    }
  }

  async createDimension(
    kind: DimensionKind,
    companyId: string,
    dto: UpsertDimensionDto,
  ) {
    const data = { companyId, code: dto.code, name: dto.name };

    switch (kind) {
      case 'departments':
        return this.prisma.department.create({
          data: { ...data, headEmployeeId: dto.headEmployeeId },
        });

      case 'area-codes':
        return this.prisma.areaCode.create({ data });

      case 'sales-areas':
        return this.prisma.salesArea.create({
          data: { ...data, managerEmployeeId: dto.managerEmployeeId },
        });

      case 'marketing-codes':
        return this.prisma.marketingCode.create({ data });
    }
  }

  async updateDimension(
    kind: DimensionKind,
    companyId: string,
    id: string,
    dto: UpsertDimensionDto,
  ) {
    await this.assertDimensionExists(kind, companyId, id);

    const data = { code: dto.code, name: dto.name, isActive: dto.isActive };

    switch (kind) {
      case 'departments':
        return this.prisma.department.update({
          where: { id },
          data: { ...data, headEmployeeId: dto.headEmployeeId },
        });

      case 'area-codes':
        return this.prisma.areaCode.update({ where: { id }, data });

      case 'sales-areas':
        return this.prisma.salesArea.update({
          where: { id },
          data: { ...data, managerEmployeeId: dto.managerEmployeeId },
        });

      case 'marketing-codes':
        return this.prisma.marketingCode.update({ where: { id }, data });
    }
  }

  // -------------------------------------------------------------------------
  // Approval rules
  // -------------------------------------------------------------------------

  async listApprovalRules(companyId: string) {
    return this.prisma.approvalRule.findMany({
      where: { companyId },
      orderBy: [{ documentType: 'asc' }, { priority: 'desc' }],
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
          include: {
            approverEmployee: {
              select: { id: true, name: true, employeeCode: true },
            },
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertCategoryExists(companyId: string, id: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, companyId },
    });

    if (!category) {
      throw new NotFoundException('Expense category not found');
    }

    return category;
  }

  private async assertCategoryCodeAvailable(companyId: string, code: string) {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { companyId, code },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Category code ${code} is already in use`);
    }
  }

  private async assertDimensionExists(
    kind: DimensionKind,
    companyId: string,
    id: string,
  ): Promise<void> {
    const where = { id, companyId };

    const found = await (kind === 'departments'
      ? this.prisma.department.findFirst({ where, select: { id: true } })
      : kind === 'area-codes'
        ? this.prisma.areaCode.findFirst({ where, select: { id: true } })
        : kind === 'sales-areas'
          ? this.prisma.salesArea.findFirst({ where, select: { id: true } })
          : this.prisma.marketingCode.findFirst({
              where,
              select: { id: true },
            }));

    if (!found) {
      throw new NotFoundException('Dimension record not found');
    }
  }
}
