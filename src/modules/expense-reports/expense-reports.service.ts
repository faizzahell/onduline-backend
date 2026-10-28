import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from '../expense-master/employees.service';

/**
 * Claim statuses whose expenses count in reports.
 *
 * A claim only contributes once it has been approved by the EXPENSE_APPROVER
 * (the director-approval step that moves the claim to APPROVED), and it keeps
 * counting after it is posted to BC. Everything earlier — a claim the employee
 * only just submitted, or one still being accrued/reviewed — is not an approved
 * expense yet, so it is left out of the figures.
 */
const REPORTABLE_STATUSES = ['APPROVED', 'POSTED'] as const;

interface PeriodRange {
  start: Date;
  end: Date;
}

@Injectable()
export class ExpenseReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  /**
   * The entertainment nominative list required for tax reporting, known on
   * the Indonesian tax form as "Daftar Nominatif Entertainment dan
   * Sejenisnya".
   *
   * The row keys are English; the mapping to the form columns is:
   * number -> No, date -> Tanggal, venue -> Tempat, address -> Alamat,
   * kind -> Jenis, amount -> Jumlah, relation* -> the Relasi Usaha block,
   * notes -> Keterangan, providedBy -> Pemberi. The client can filter the
   * list by month and export it to Excel.
   */
  async entertainmentNominative(
    companyId: string,
    year: number,
    month?: number,
  ) {
    const range = this.resolveRange(year, month);

    const entries = await this.prisma.expenseEntry.findMany({
      where: {
        companyId,
        expenseDate: { gte: range.start, lte: range.end },
        entertainment: { isNot: null },
        claim: { status: { in: [...REPORTABLE_STATUSES] } },
      },
      orderBy: { expenseDate: 'asc' },
      include: {
        entertainment: true,
        employee: { select: { name: true, employeeCode: true } },
        marketingCode: { select: { code: true, name: true } },
        claim: { select: { claimNumber: true, status: true } },
      },
    });

    const rows = entries.map((entry, index) => ({
      number: index + 1,
      date: entry.expenseDate,
      venue: entry.entertainment?.merchantName ?? '',
      address: entry.entertainment?.merchantAddress ?? '',
      kind: entry.entertainment?.kind ?? '',
      amount: Number(entry.approvedAmount ?? entry.amount),
      relationName: entry.entertainment?.relationName ?? '',
      relationPosition: entry.entertainment?.relationPosition ?? '',
      relationPhone: entry.entertainment?.relationPhone ?? '',
      relationCompany: entry.entertainment?.relationCompany ?? '',
      relationBusinessType: entry.entertainment?.relationBusinessType ?? '',
      notes: entry.entertainment?.notes ?? entry.remark ?? '',
      providedBy: entry.employee.name,
      marketingCode: entry.marketingCode?.code ?? '',
      claimNumber: entry.claim?.claimNumber ?? '',
    }));

    return {
      taxYear: year,
      month: month ?? null,
      total: rows.reduce((sum, row) => sum + row.amount, 0),
      rows,
    };
  }

  /** The expense recap of the signed-in account, resolving their employee. */
  async myExpenseForm(
    companyId: string,
    userId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const employee = await this.employees.findByUser(companyId, userId);
    return this.employeeExpenseForm(
      companyId,
      employee.id,
      periodStart,
      periodEnd,
    );
  }

  /**
   * Expense form per employee per period, mirroring the Excel layout in use
   * today: one row per date and one column per category.
   *
   * Every expense the employee recorded in the period is included — claimed or
   * not — so the recap reflects what was actually spent. Dates without a
   * transaction are not shown, following the note on the form.
   */
  async employeeExpenseForm(
    companyId: string,
    employeeId: string,
    periodStart: string,
    periodEnd: string,
  ) {
    const start = new Date(`${periodStart.slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(`${periodEnd.slice(0, 10)}T23:59:59.999Z`);

    if (end < start) {
      throw new BadRequestException(
        'The period end cannot be earlier than the period start',
      );
    }

    const employee = await this.employees.findOne(companyId, employeeId);

    const entries = await this.prisma.expenseEntry.findMany({
      where: {
        companyId,
        employeeId,
        expenseDate: { gte: start, lte: end },
      },
      orderBy: [{ expenseDate: 'asc' }, { enteredAt: 'asc' }],
      include: {
        category: { select: { id: true, code: true, name: true } },
        mealAllowance: true,
        claim: { select: { claimNumber: true, status: true } },
      },
    });

    const categories = [
      ...new Map(
        entries.map((entry) => [entry.category.id, entry.category]),
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));

    const rowsByDate = new Map<
      string,
      {
        date: string;
        amounts: Record<string, number>;
        remarks: string[];
        total: number;
      }
    >();

    for (const entry of entries) {
      const key = entry.expenseDate.toISOString().slice(0, 10);

      const row = rowsByDate.get(key) ?? {
        date: key,
        amounts: {},
        remarks: [],
        total: 0,
      };

      const amount = Number(entry.approvedAmount ?? entry.amount);

      row.amounts[entry.category.code] =
        (row.amounts[entry.category.code] ?? 0) + amount;
      row.total += amount;

      const note = entry.destination ?? entry.description ?? entry.remark;

      if (note && !row.remarks.includes(note)) {
        row.remarks.push(note);
      }

      rowsByDate.set(key, row);
    }

    const rows = [...rowsByDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const totalsByCategory = categories.map((category) => ({
      code: category.code,
      name: category.name,
      amount: rows.reduce(
        (sum, row) => sum + (row.amounts[category.code] ?? 0),
        0,
      ),
    }));

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        position: employee.position,
        department: employee.department?.name ?? null,
      },
      periodStart,
      periodEnd,
      categories: categories.map((category) => ({
        code: category.code,
        name: category.name,
      })),
      rows,
      totalsByCategory,
      grandTotal: rows.reduce((sum, row) => sum + row.total, 0),
    };
  }

  /**
   * Headline figures for the management dashboard: current month, year to
   * date, a breakdown by category and by area, plus last year as a comparison.
   */
  async dashboard(companyId: string, year: number, month: number) {
    const monthRange = this.resolveRange(year, month);
    const yearRange = this.resolveRange(year);
    const lastYearRange = this.resolveRange(year - 1);

    const [monthEntries, yearEntries, lastYearTotal, statusCounts] =
      await Promise.all([
        this.loadReportableEntries(companyId, monthRange),
        this.loadReportableEntries(companyId, yearRange),
        this.sumReportable(companyId, lastYearRange),
        this.prisma.expenseClaim.groupBy({
          by: ['status'],
          where: { companyId },
          _count: { _all: true },
          _sum: { submittedAmount: true },
        }),
      ]);

    const yearTotal = yearEntries.reduce(
      (sum, entry) => sum + Number(entry.approvedAmount ?? entry.amount),
      0,
    );

    return {
      year,
      month,
      currentMonthTotal: monthEntries.reduce(
        (sum, entry) => sum + Number(entry.approvedAmount ?? entry.amount),
        0,
      ),
      yearToDateTotal: yearTotal,
      lastYearTotal,
      yearOverYearChangePercent:
        lastYearTotal === 0
          ? null
          : Math.round(((yearTotal - lastYearTotal) / lastYearTotal) * 1000) /
            10,
      byCategory: groupSum(yearEntries, (entry) => entry.category.name),
      byArea: groupSum(
        yearEntries,
        (entry) => entry.employee.areaCode?.name ?? 'No Area',
      ),
      byMonth: groupSum(yearEntries, (entry) =>
        String(entry.expenseDate.getUTCMonth() + 1).padStart(2, '0'),
      ),
      claimsByStatus: statusCounts.map((group) => ({
        status: group.status,
        count: group._count._all,
        amount: Number(group._sum.submittedAmount ?? 0),
      })),
    };
  }

  private async loadReportableEntries(companyId: string, range: PeriodRange) {
    return this.prisma.expenseEntry.findMany({
      where: {
        companyId,
        expenseDate: { gte: range.start, lte: range.end },
        claim: { status: { in: [...REPORTABLE_STATUSES] } },
      },
      include: {
        category: { select: { name: true } },
        employee: {
          select: { areaCode: { select: { name: true } } },
        },
      },
    });
  }

  private async sumReportable(
    companyId: string,
    range: PeriodRange,
  ): Promise<number> {
    const result = await this.prisma.expenseEntry.aggregate({
      where: {
        companyId,
        expenseDate: { gte: range.start, lte: range.end },
        claim: { status: { in: [...REPORTABLE_STATUSES] } },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount ?? 0);
  }

  private resolveRange(year: number, month?: number): PeriodRange {
    if (month === undefined) {
      return {
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      };
    }

    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }

    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
    };
  }
}

function groupSum<T extends { amount: unknown; approvedAmount: unknown }>(
  items: T[],
  keyOf: (item: T) => string,
): { label: string; amount: number }[] {
  const groups = new Map<string, number>();

  for (const item of items) {
    const key = keyOf(item);
    const amount = Number(item.approvedAmount ?? item.amount);

    groups.set(key, (groups.get(key) ?? 0) + amount);
  }

  return [...groups.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}
