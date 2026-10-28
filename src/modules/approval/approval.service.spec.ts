import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RbacService } from '../rbac/rbac.service';
import { ApprovalService } from './approval.service';
import type { ApprovalClaimant } from './approval.types';

vi.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * The "Non Sales / Back Office" rule: a Finance accrual, an HOD review, a
 * director approval, and a Finance posting. The HOD review is the step that
 * depends on the requester's org data being filled in.
 */
const nonSalesRule = {
  name: 'Expense Claim - Non Sales / Back Office',
  steps: [
    {
      sequence: 10,
      stepType: 'ACCRUE',
      approverType: 'ROLE',
      approverRoleName: 'FINANCE',
      approverEmployeeId: null,
      label: 'Accrual by Finance',
      minAmount: null,
    },
    {
      sequence: 20,
      stepType: 'REVIEW',
      approverType: 'DEPARTMENT_HEAD',
      approverRoleName: null,
      approverEmployeeId: null,
      label: 'Review HOD',
      minAmount: null,
    },
    {
      sequence: 30,
      stepType: 'APPROVE',
      approverType: 'ROLE',
      approverRoleName: 'EXPENSE_APPROVER',
      approverEmployeeId: null,
      label: 'Director approval',
      minAmount: null,
    },
    {
      sequence: 40,
      stepType: 'POST',
      approverType: 'ROLE',
      approverRoleName: 'FINANCE',
      approverEmployeeId: null,
      label: 'Posting by Finance',
      minAmount: null,
    },
  ],
  minAmount: null,
  maxAmount: null,
};

describe('ApprovalService.buildSteps', () => {
  let service: ApprovalService;

  const prismaMock = {
    approvalRule: { findMany: vi.fn() },
    department: { findUnique: vi.fn() },
    salesArea: { findUnique: vi.fn() },
    claimApprovalStep: { deleteMany: vi.fn(), create: vi.fn() },
  };

  const rbac = {} as unknown as RbacService;

  const createdSteps = () =>
    prismaMock.claimApprovalStep.create.mock.calls.map((call) => call[0].data);

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.approvalRule.findMany.mockResolvedValue([nonSalesRule]);
    prismaMock.department.findUnique.mockResolvedValue(null);
    prismaMock.salesArea.findUnique.mockResolvedValue(null);
    service = new ApprovalService(prismaMock as never, rbac);
  });

  const claimant = (
    overrides: Partial<ApprovalClaimant> = {},
  ): ApprovalClaimant => ({
    employeeId: 'emp-1',
    level: 'STAFF',
    division: 'NON_SALES',
    departmentId: null,
    salesAreaId: null,
    ...overrides,
  });

  it('skips the HOD review when the requester has no department, instead of failing', async () => {
    await expect(
      service.buildSteps({
        companyId: 'company-1',
        document: { documentType: 'EXPENSE_CLAIM', claimId: 'claim-1' },
        claimant: claimant(),
        amount: 500_000,
      }),
    ).resolves.toBeUndefined();

    const steps = createdSteps();
    const review = steps.find((step) => step.sequence === 20);

    // The review is bypassed, but the role-based steps still gate the claim.
    expect(review.status).toBe('SKIPPED');
    expect(review.assignedEmployeeId).toBeNull();

    const pending = steps.filter((step) => step.status === 'PENDING');
    expect(pending.map((step) => step.stepType)).toEqual([
      'ACCRUE',
      'APPROVE',
      'POST',
    ]);
  });

  it('skips the HOD review when the department has no head assigned', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      headEmployeeId: null,
    });

    await service.buildSteps({
      companyId: 'company-1',
      document: { documentType: 'EXPENSE_CLAIM', claimId: 'claim-1' },
      claimant: claimant({ departmentId: 'dept-1' }),
      amount: 500_000,
    });

    const review = createdSteps().find((step) => step.sequence === 20);
    expect(review.status).toBe('SKIPPED');
  });

  it('assigns the HOD review when the department head is a different person', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      headEmployeeId: 'hod-7',
    });

    await service.buildSteps({
      companyId: 'company-1',
      document: { documentType: 'EXPENSE_CLAIM', claimId: 'claim-1' },
      claimant: claimant({ departmentId: 'dept-1' }),
      amount: 500_000,
    });

    const review = createdSteps().find((step) => step.sequence === 20);
    expect(review.status).toBe('PENDING');
    expect(review.assignedEmployeeId).toBe('hod-7');
  });

  it('skips the HOD review when the department head is the requester', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      headEmployeeId: 'emp-1',
    });

    await service.buildSteps({
      companyId: 'company-1',
      document: { documentType: 'EXPENSE_CLAIM', claimId: 'claim-1' },
      claimant: claimant({ departmentId: 'dept-1' }),
      amount: 500_000,
    });

    const review = createdSteps().find((step) => step.sequence === 20);
    expect(review.status).toBe('SKIPPED');
  });
});
