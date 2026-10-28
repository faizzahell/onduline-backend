import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentNumberService } from '../../common/numbering/document-number.service';
import { BcJournalService } from './bc-journal.service';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const company = {
  accruedAccountNo: '32001900',
  accruedAccountName: 'Accrued Others',
  bankAccountNo: '11000001',
  bankAccountName: 'Bank BCA',
  journalInitials: 'IS',
  pettyCashJournalInitials: 'RE',
  accrualAreaCode: 'HO',
};

const employee = {
  employeeCode: 'AKX',
  name: 'Ahfil Kalimi',
  areaCode: { code: 'RM01' },
  department: { code: 'COMMERCIAL' },
};

/** One claim line with its submitted amount and its approved amount. */
function entry(amount: number, approvedAmount: number | null = null) {
  return {
    amount,
    approvedAmount,
    expenseDate: new Date('2026-08-15'),
    destination: 'Jakarta',
    description: null,
    category: {
      name: 'Gasoline',
      glAccountNo: '60005051',
      glAccountName: 'Gasoline/Petrol',
    },
    marketingCode: null,
    employee,
  };
}

describe('BcJournalService', () => {
  let service: BcJournalService;

  const prismaMock = {
    expenseClaim: { findUnique: vi.fn() },
    pettyCashBatch: { findUnique: vi.fn() },
    bcJournalBatch: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  };

  const documentNumbers = {
    nextJournalDocumentNo: vi.fn(),
  } as unknown as DocumentNumberService;

  /** The journal lines handed to Prisma on the most recent call. */
  function capturedLines() {
    const call = prismaMock.bcJournalBatch.create.mock.calls.at(-1);
    return call?.[0].data.lines.create as {
      accountNo: string;
      amount: number;
      areaCode?: string;
    }[];
  }

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(documentNumbers.nextJournalDocumentNo).mockResolvedValue(
      'GJ26-IS0218',
    );

    prismaMock.bcJournalBatch.create.mockImplementation((args: unknown) =>
      Promise.resolve({ id: 'batch-1', ...(args as { data: unknown }).data }),
    );

    service = new BcJournalService(prismaMock as never, documentNumbers);
  });

  describe('createExpenseAccrual', () => {
    beforeEach(() => {
      prismaMock.expenseClaim.findUnique.mockResolvedValue({
        id: 'claim-1',
        companyId: 'company-1',
        claimNumber: 'EXP/26/000001',
        company,
        employee,
        entries: [entry(500_000), entry(300_000)],
      });
    });

    it('debits the category account and credits the accrual account', async () => {
      await service.createExpenseAccrual('claim-1', new Date('2026-08-20'));

      const lines = capturedLines();

      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({
        accountNo: '60005051',
        amount: 500_000,
      });
      expect(lines[1]).toMatchObject({
        accountNo: '60005051',
        amount: 300_000,
      });
      expect(lines[2]).toMatchObject({
        accountNo: '32001900',
        amount: -800_000,
        areaCode: 'HO',
      });
    });

    it('produces a balanced journal', async () => {
      await service.createExpenseAccrual('claim-1', new Date('2026-08-20'));

      const total = capturedLines().reduce((sum, line) => sum + line.amount, 0);

      expect(total).toBe(0);
    });

    it('carries the employee BC dimensions onto every line', async () => {
      await service.createExpenseAccrual('claim-1', new Date('2026-08-20'));

      expect(capturedLines()[0]).toMatchObject({
        areaCode: 'RM01',
        employeeCode: 'AKX',
        departmentCode: 'COMMERCIAL',
      });
    });

    it('rejects a category without a G/L account number', async () => {
      prismaMock.expenseClaim.findUnique.mockResolvedValue({
        id: 'claim-1',
        companyId: 'company-1',
        claimNumber: 'EXP/26/000001',
        company,
        employee,
        entries: [
          {
            ...entry(100_000),
            category: {
              name: 'Taxi',
              glAccountNo: null,
              glAccountName: null,
            },
          },
        ],
      });

      await expect(
        service.createExpenseAccrual('claim-1', new Date('2026-08-20')),
      ).rejects.toThrow(/has no G\/L account number/);
    });
  });

  describe('createExpenseReversalPayment', () => {
    function arrangeClaim(entries: ReturnType<typeof entry>[]) {
      prismaMock.expenseClaim.findUnique.mockResolvedValue({
        id: 'claim-1',
        companyId: 'company-1',
        claimNumber: 'EXP/26/000001',
        company,
        employee,
        entries,
      });
    }

    it('same amount: reverses the accrual then pays the same figure', async () => {
      arrangeClaim([entry(500_000)]);

      await service.createExpenseReversalPayment(
        'claim-1',
        new Date('2026-08-25'),
      );

      const lines = capturedLines();

      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({
        accountNo: '32001900',
        amount: 500_000,
      });
      expect(lines[1]).toMatchObject({
        accountNo: '11000001',
        amount: -500_000,
      });
    });

    it('higher amount: adds to the expense and pays more', async () => {
      arrangeClaim([entry(500_000, 550_000)]);

      await service.createExpenseReversalPayment(
        'claim-1',
        new Date('2026-08-25'),
      );

      const lines = capturedLines();

      expect(lines[0]).toMatchObject({
        accountNo: '32001900',
        amount: 500_000,
      });
      expect(lines[1]).toMatchObject({ accountNo: '60005051', amount: 50_000 });
      expect(lines[2]).toMatchObject({
        accountNo: '11000001',
        amount: -550_000,
      });
    });

    it('lower amount: credits the expense and pays less', async () => {
      arrangeClaim([entry(500_000, 450_000)]);

      await service.createExpenseReversalPayment(
        'claim-1',
        new Date('2026-08-25'),
      );

      const lines = capturedLines();

      expect(lines[0]).toMatchObject({
        accountNo: '32001900',
        amount: 500_000,
      });
      expect(lines[1]).toMatchObject({
        accountNo: '60005051',
        amount: -50_000,
      });
      expect(lines[2]).toMatchObject({
        accountNo: '11000001',
        amount: -450_000,
      });
    });

    it('stays balanced in all three scenarios', async () => {
      for (const rows of [
        [entry(500_000)],
        [entry(500_000, 550_000)],
        [entry(500_000, 450_000)],
      ]) {
        arrangeClaim(rows);

        await service.createExpenseReversalPayment(
          'claim-1',
          new Date('2026-08-25'),
        );

        const total = capturedLines().reduce(
          (sum, line) => sum + line.amount,
          0,
        );

        expect(total).toBe(0);
      }
    });

    it('rejects the journal when the company bank account is not set', async () => {
      prismaMock.expenseClaim.findUnique.mockResolvedValue({
        id: 'claim-1',
        companyId: 'company-1',
        claimNumber: 'EXP/26/000001',
        company: { ...company, bankAccountNo: null },
        employee,
        entries: [entry(500_000)],
      });

      await expect(
        service.createExpenseReversalPayment('claim-1', new Date()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPettyCashJournal', () => {
    it('debits the category account and credits the cash account', async () => {
      prismaMock.pettyCashBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        companyId: 'company-1',
        batchNumber: 'PCB/26/000001',
        company,
        entries: [
          {
            expenseDate: new Date('2026-08-03'),
            description: 'Materai 100',
            amount: 1_050_000,
            areaCode: 'HO',
            employeeCode: null,
            departmentCode: 'COMMERCIAL',
            category: {
              name: 'Stamp Duty',
              glAccountNo: '63000018',
              glAccountName: 'Stamp Duty',
            },
          },
        ],
      });

      await service.createPettyCashJournal('batch-1', new Date('2026-08-04'));

      const lines = capturedLines();

      expect(lines[0]).toMatchObject({
        accountNo: '63000018',
        amount: 1_050_000,
      });
      expect(lines[0].description).toContain('Office PC - Materai 100');
      expect(lines[1]).toMatchObject({
        accountNo: '11000001',
        amount: -1_050_000,
      });
    });

    it('uses the petty cash PIC initials for the document number', async () => {
      prismaMock.pettyCashBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        companyId: 'company-1',
        batchNumber: 'PCB/26/000001',
        company,
        entries: [
          {
            expenseDate: new Date('2026-08-03'),
            description: 'Air minum',
            amount: 134_000,
            areaCode: 'HO',
            employeeCode: null,
            departmentCode: null,
            category: {
              name: 'Office Suppliers',
              glAccountNo: '63000012',
              glAccountName: 'Office Suppliers/Sundries',
            },
          },
        ],
      });

      await service.createPettyCashJournal('batch-1', new Date('2026-08-04'));

      expect(documentNumbers.nextJournalDocumentNo).toHaveBeenCalledWith(
        'company-1',
        'RE',
        expect.any(Date),
        expect.anything(),
      );
    });
  });
});
