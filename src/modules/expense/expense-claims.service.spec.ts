import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentNumberService } from '../../common/numbering/document-number.service';
import type { ApprovalService } from '../approval/approval.service';
import type { BcJournalService } from '../business-central/bc-journal.service';
import type { EmployeesService } from '../expense-master/employees.service';
import { ExpenseClaimsService } from './expense-claims.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const employee = {
  id: 'employee-1',
  name: 'Budi',
  employeeCode: 'BDX',
  level: 'STAFF',
  division: 'SALES',
  departmentId: 'dept-1',
  salesAreaId: 'area-1',
};

const claimant = {
  employeeId: employee.id,
  level: 'STAFF' as const,
  division: 'SALES' as const,
  departmentId: 'dept-1',
  salesAreaId: 'area-1',
};

describe('ExpenseClaimsService', () => {
  let service: ExpenseClaimsService;

  const prismaMock = {
    expenseEntry: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    expenseClaim: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    expenseOcrJob: { findMany: vi.fn(), deleteMany: vi.fn() },
    bcJournalBatch: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };

  const employees = {
    findByUser: vi.fn(),
    findClaimant: vi.fn(),
  } as unknown as EmployeesService;

  const approval = {
    buildSteps: vi.fn(),
    listSteps: vi.fn(),
    approveCurrentStep: vi.fn(),
    requestRevision: vi.fn(),
    listPendingStepsForUser: vi.fn(),
  } as unknown as ApprovalService;

  const journal = {
    createExpenseAccrual: vi.fn(),
    createExpenseReversalPayment: vi.fn(),
  } as unknown as BcJournalService;

  const documentNumbers = {
    nextDocumentNumber: vi.fn(),
  } as unknown as DocumentNumberService;

  const storage = { deleteFile: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(employees.findByUser).mockResolvedValue(employee as never);
    vi.mocked(employees.findClaimant).mockResolvedValue(claimant);
    vi.mocked(documentNumbers.nextDocumentNumber).mockResolvedValue(
      'EXP/26/000001',
    );
    vi.mocked(approval.listSteps).mockResolvedValue([] as never);

    prismaMock.$transaction.mockImplementation((callback: unknown) =>
      (callback as (tx: unknown) => Promise<unknown>)(prismaMock),
    );

    prismaMock.expenseClaim.create.mockResolvedValue({ id: 'claim-1' });
    prismaMock.expenseClaim.findFirst.mockResolvedValue({
      id: 'claim-1',
      status: 'SUBMITTED',
      employeeId: employee.id,
      entries: [],
      claimNumber: 'EXP/26/000001',
    });

    service = new ExpenseClaimsService(
      prismaMock as never,
      employees,
      approval,
      journal,
      documentNumbers,
      storage as never,
    );
  });

  /**
   * The rule in the requirement that is easiest to misread: entries are
   * selected by their **entry** date, not by the receipt date. The example in
   * the document shows a 17 August receipt recorded on 23 August still landing
   * in the 21 August - 20 September claim.
   */
  describe('entry selection by entry date', () => {
    it('filters on enteredAt, not on expenseDate', async () => {
      prismaMock.expenseEntry.findMany.mockResolvedValue([]);

      await service.previewPeriod(
        'company-1',
        'user-1',
        '2026-08-21',
        '2026-09-20',
      );

      const where = prismaMock.expenseEntry.findMany.mock.calls[0][0].where;

      expect(where).not.toHaveProperty('expenseDate');
      expect(where.enteredAt).toEqual({
        gte: new Date('2026-08-21T00:00:00.000Z'),
        lte: new Date('2026-09-20T23:59:59.999Z'),
      });
    });

    it('only picks up entries that have never been claimed and are verified', async () => {
      prismaMock.expenseEntry.findMany.mockResolvedValue([]);

      await service.previewPeriod(
        'company-1',
        'user-1',
        '2026-08-21',
        '2026-09-20',
      );

      const where = prismaMock.expenseEntry.findMany.mock.calls[0][0].where;
      expect(where.claimId).toBeNull();
      // Drafts must never be swept into a claim; only verified lines are.
      expect(where.status).toBe('VERIFIED');
    });

    it('produces the total from the example in the requirement', async () => {
      prismaMock.expenseEntry.findMany.mockResolvedValue([
        {
          amount: 150_000,
          expenseDate: new Date('2026-08-17'),
          enteredAt: new Date('2026-08-23'),
          category: {
            id: 'c1',
            code: 'MEAL_ALLOWANCE',
            name: 'Meal Allowance',
          },
          attachments: [],
        },
        {
          amount: 75_000,
          expenseDate: new Date('2026-08-23'),
          enteredAt: new Date('2026-08-24'),
          category: { id: 'c2', code: 'GASOLINE', name: 'Gasoline' },
          attachments: [],
        },
      ]);

      const preview = await service.previewPeriod(
        'company-1',
        'user-1',
        '2026-08-21',
        '2026-09-20',
      );

      expect(preview.totalAmount).toBe(225_000);
      expect(preview.entryCount).toBe(2);
    });

    it('rejects a reversed period', async () => {
      await expect(
        service.previewPeriod(
          'company-1',
          'user-1',
          '2026-09-20',
          '2026-08-21',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submit', () => {
    it('rejects a submission when there are no claimable entries', async () => {
      prismaMock.expenseEntry.findMany.mockResolvedValue([]);

      await expect(
        service.submit('company-1', 'user-1', {
          periodStart: '2026-08-21',
          periodEnd: '2026-09-20',
        }),
      ).rejects.toThrow(/no verified expense entries that can be claimed/);
    });

    it('links the entries to the claim to prevent double claiming', async () => {
      prismaMock.expenseEntry.findMany.mockResolvedValue([
        { id: 'entry-1', amount: 150_000 },
        { id: 'entry-2', amount: 75_000 },
      ]);

      await service.submit('company-1', 'user-1', {
        periodStart: '2026-08-21',
        periodEnd: '2026-09-20',
      });

      expect(prismaMock.expenseEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['entry-1', 'entry-2'] } },
        data: { claimId: 'claim-1' },
      });
    });

    it('stores the submitted total and builds the approval steps', async () => {
      prismaMock.expenseEntry.findMany.mockResolvedValue([
        { id: 'entry-1', amount: 150_000 },
        { id: 'entry-2', amount: 75_000 },
      ]);

      await service.submit('company-1', 'user-1', {
        periodStart: '2026-08-21',
        periodEnd: '2026-09-20',
      });

      expect(
        prismaMock.expenseClaim.create.mock.calls[0][0].data,
      ).toMatchObject({ submittedAmount: 225_000, status: 'SUBMITTED' });

      expect(approval.buildSteps).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 225_000, claimant }),
        expect.anything(),
      );
    });
  });

  describe('accrue', () => {
    it('creates the accrual journal and then marks the claim ACCRUED', async () => {
      await service.accrue('company-1', 'user-1', 'claim-1');

      expect(approval.approveCurrentStep).toHaveBeenCalledWith(
        { documentType: 'EXPENSE_CLAIM', claimId: 'claim-1' },
        'user-1',
        'ACCRUE',
        undefined,
        expect.anything(),
      );

      expect(journal.createExpenseAccrual).toHaveBeenCalled();

      expect(prismaMock.expenseClaim.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACCRUED' }),
        }),
      );
    });
  });

  describe('post', () => {
    it('rejects posting a claim that has not been approved', async () => {
      prismaMock.expenseClaim.findFirst.mockResolvedValue({
        id: 'claim-1',
        status: 'SUBMITTED',
        employeeId: employee.id,
        entries: [],
      });

      await expect(
        service.post('company-1', 'user-1', 'claim-1'),
      ).rejects.toThrow(/cannot be moved to POSTED/);
    });

    it('creates the reversal journal and marks the claim POSTED', async () => {
      // `findFirst` is used both by the status check and by findOne, so the
      // mock has to carry the relations that both of them read.
      prismaMock.expenseClaim.findFirst.mockResolvedValue({
        id: 'claim-1',
        status: 'APPROVED',
        employeeId: employee.id,
        claimNumber: 'EXP/26/000001',
        entries: [],
      });

      await service.post('company-1', 'user-1', 'claim-1');

      expect(journal.createExpenseReversalPayment).toHaveBeenCalled();
      expect(prismaMock.expenseClaim.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'POSTED' }),
        }),
      );
    });
  });

  describe('deleteClaimAndSubmitterData', () => {
    beforeEach(() => {
      prismaMock.expenseClaim.findFirst.mockResolvedValue({
        id: 'claim-1',
        employeeId: employee.id,
        employee: { name: 'Budi', employeeCode: 'BDX' },
      });
      prismaMock.expenseEntry.findMany.mockResolvedValue([
        { attachments: [{ storageKey: 'expense/e1/a.png' }] },
      ]);
      prismaMock.expenseOcrJob.findMany.mockResolvedValue([
        { storageKey: 'expense/e1/receipt.png' },
      ]);
      prismaMock.expenseClaim.findMany.mockResolvedValue([{ id: 'claim-1' }]);
      prismaMock.bcJournalBatch.deleteMany.mockResolvedValue({ count: 2 });
      prismaMock.expenseOcrJob.deleteMany.mockResolvedValue({ count: 1 });
      prismaMock.expenseEntry.deleteMany.mockResolvedValue({ count: 3 });
      prismaMock.expenseClaim.deleteMany.mockResolvedValue({ count: 1 });
    });

    it('wipes every expense record belonging to the submitter in that company', async () => {
      const result = await service.deleteClaimAndSubmitterData(
        'company-1',
        'claim-1',
      );

      // Scoped to the submitting employee within the active company.
      const entryWhere =
        prismaMock.expenseEntry.deleteMany.mock.calls[0][0].where;
      expect(entryWhere).toEqual({
        companyId: 'company-1',
        employeeId: employee.id,
      });

      const claimWhere =
        prismaMock.expenseClaim.deleteMany.mock.calls[0][0].where;
      expect(claimWhere).toEqual({
        companyId: 'company-1',
        employeeId: employee.id,
      });

      expect(result.deleted).toEqual({
        journalBatches: 2,
        ocrJobs: 1,
        entries: 3,
        claims: 1,
      });
      expect(result.submitter).toEqual({ name: 'Budi', employeeCode: 'BDX' });
    });

    it('removes the stored files for the deleted rows', async () => {
      await service.deleteClaimAndSubmitterData('company-1', 'claim-1');

      expect(storage.deleteFile).toHaveBeenCalledWith('expense/e1/a.png');
      expect(storage.deleteFile).toHaveBeenCalledWith('expense/e1/receipt.png');
    });

    it('throws when the claim does not exist in this company', async () => {
      prismaMock.expenseClaim.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deleteClaimAndSubmitterData('company-1', 'missing'),
      ).rejects.toThrow(/Claim not found/);
    });
  });
});
