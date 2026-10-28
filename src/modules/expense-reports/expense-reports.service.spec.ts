import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmployeesService } from '../expense-master/employees.service';
import { ExpenseReportsService } from './expense-reports.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('ExpenseReportsService', () => {
  let service: ExpenseReportsService;

  const prismaMock = {
    expenseEntry: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    expenseClaim: {
      groupBy: vi.fn(),
    },
  };

  const employees = {
    findByUser: vi.fn(),
    findOne: vi.fn(),
  } as unknown as EmployeesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.expenseEntry.findMany.mockResolvedValue([]);
    prismaMock.expenseEntry.aggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    prismaMock.expenseClaim.groupBy.mockResolvedValue([]);
    service = new ExpenseReportsService(prismaMock as never, employees);
  });

  describe('dashboard', () => {
    it('only counts claims approved by the expense approver (APPROVED/POSTED)', async () => {
      await service.dashboard('company-1', 2026, 10);

      // Every entry query that feeds the dashboard figures must be gated on the
      // post-approval claim statuses, never on SUBMITTED/ACCRUED/UNDER_REVIEW.
      const statusFilters = [
        ...prismaMock.expenseEntry.findMany.mock.calls,
        ...prismaMock.expenseEntry.aggregate.mock.calls,
      ].map((call) => call[0].where.claim.status.in);

      expect(statusFilters.length).toBeGreaterThan(0);
      for (const filter of statusFilters) {
        expect(filter).toEqual(['APPROVED', 'POSTED']);
      }
    });

    it('sums approved amounts for the current month and the year to date', async () => {
      // Two approved entries in the year, one of them in the selected month.
      prismaMock.expenseEntry.findMany
        .mockResolvedValueOnce([
          {
            amount: 100_000,
            approvedAmount: 90_000,
            expenseDate: new Date('2026-10-05'),
            category: { name: 'Toll' },
            employee: { areaCode: null },
          },
        ])
        .mockResolvedValueOnce([
          {
            amount: 100_000,
            approvedAmount: 90_000,
            expenseDate: new Date('2026-10-05'),
            category: { name: 'Toll' },
            employee: { areaCode: null },
          },
          {
            amount: 50_000,
            approvedAmount: null,
            expenseDate: new Date('2026-03-01'),
            category: { name: 'Parking' },
            employee: { areaCode: null },
          },
        ]);

      const result = await service.dashboard('company-1', 2026, 10);

      // The revised (approved) amount wins over the submitted amount.
      expect(result.currentMonthTotal).toBe(90_000);
      expect(result.yearToDateTotal).toBe(140_000);
      // Grouped by two-digit month for the chart.
      expect(result.byMonth).toContainEqual({ label: '10', amount: 90_000 });
      expect(result.byMonth).toContainEqual({ label: '03', amount: 50_000 });
    });
  });

  describe('entertainmentNominative', () => {
    it('includes only approved entertainment expenses', async () => {
      await service.entertainmentNominative('company-1', 2026);

      const where = prismaMock.expenseEntry.findMany.mock.calls[0][0].where;
      expect(where.claim.status.in).toEqual(['APPROVED', 'POSTED']);
    });
  });
});
