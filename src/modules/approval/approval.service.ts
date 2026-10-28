import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { PrismaTransactionClient } from '../../common/prisma/prisma-transaction';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APPROVAL_OVERRIDE_ROLES, RbacService } from '../rbac/rbac.service';
import {
  type ApprovalClaimant,
  type ApprovalDocumentRef,
  type ApprovalStepType,
  toDocumentWhere,
} from './approval.types';

interface BuildStepsInput {
  companyId: string;
  document: ApprovalDocumentRef;
  claimant: ApprovalClaimant;
  /** Document amount, which decides the rule and which steps can be skipped. */
  amount: number;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * Builds a document's chain of approval steps from the matching rule, then
   * stores it.
   *
   * Steps are materialised at submit time rather than re-read from the rule on
   * every request, so changing a rule does not disrupt documents already in
   * flight.
   */
  async buildSteps(
    input: BuildStepsInput,
    client?: PrismaTransactionClient,
  ): Promise<void> {
    const db = client ?? this.prisma;
    const rule = await this.findMatchingRule(input);
    const supervisors = await this.loadSupervisors(input.claimant);

    const documentWhere = toDocumentWhere(input.document);

    await db.claimApprovalStep.deleteMany({ where: documentWhere });

    for (const step of rule.steps) {
      const belowThreshold =
        step.minAmount !== null && input.amount < Number(step.minAmount);

      const resolved = belowThreshold
        ? { assignedEmployeeId: null, assignedRoleName: null, skip: true }
        : this.resolveAssignment(step, input.claimant, supervisors, rule.name);

      await db.claimApprovalStep.create({
        data: {
          documentType: input.document.documentType,
          ...documentWhere,
          sequence: step.sequence,
          stepType: step.stepType,
          label: step.label,
          status: resolved.skip ? 'SKIPPED' : 'PENDING',
          assignedEmployeeId: resolved.assignedEmployeeId,
          assignedRoleName: resolved.assignedRoleName,
        },
      });
    }
  }

  /** The next active step, or `null` once the whole chain is complete. */
  async findCurrentStep(document: ApprovalDocumentRef) {
    return this.prisma.claimApprovalStep.findFirst({
      where: { ...toDocumentWhere(document), status: 'PENDING' },
      orderBy: { sequence: 'asc' },
      include: {
        assignedEmployee: {
          select: { id: true, name: true, employeeCode: true, userId: true },
        },
      },
    });
  }

  async listSteps(document: ApprovalDocumentRef) {
    return this.prisma.claimApprovalStep.findMany({
      where: toDocumentWhere(document),
      orderBy: { sequence: 'asc' },
      include: {
        assignedEmployee: {
          select: { id: true, name: true, employeeCode: true },
        },
      },
    });
  }

  /**
   * Approves the active step.
   *
   * @returns `true` once the document has cleared its final step.
   */
  async approveCurrentStep(
    document: ApprovalDocumentRef,
    userId: string,
    expectedStepType: ApprovalStepType | undefined,
    remark: string | undefined,
    client?: PrismaTransactionClient,
  ): Promise<{ completed: boolean; stepType: ApprovalStepType }> {
    const step = await this.assertCanAct(document, userId, expectedStepType);
    const db = client ?? this.prisma;

    await db.claimApprovalStep.update({
      where: { id: step.id },
      data: {
        status: 'APPROVED',
        actedByUserId: userId,
        actedAt: new Date(),
        remark,
      },
    });

    const remaining = await db.claimApprovalStep.count({
      where: {
        ...toDocumentWhere(document),
        status: 'PENDING',
        id: { not: step.id },
      },
    });

    return {
      completed: remaining === 0,
      stepType: step.stepType as ApprovalStepType,
    };
  }

  /**
   * Requests a revision. The document goes back to the requester and every
   * step is reset, so the chain restarts from the beginning once it is fixed.
   */
  async requestRevision(
    document: ApprovalDocumentRef,
    userId: string,
    remark: string,
    client?: PrismaTransactionClient,
  ): Promise<void> {
    const step = await this.assertCanAct(document, userId, undefined);
    const db = client ?? this.prisma;

    await db.claimApprovalStep.update({
      where: { id: step.id },
      data: {
        status: 'REVISION_REQUESTED',
        actedByUserId: userId,
        actedAt: new Date(),
        remark,
      },
    });
  }

  /**
   * Makes sure the user is entitled to act on the active step.
   *
   * ADMINISTRATOR may act on any step, so the process does not stall when the
   * role holder is unavailable.
   */
  async assertCanAct(
    document: ApprovalDocumentRef,
    userId: string,
    expectedStepType: ApprovalStepType | undefined,
  ) {
    const step = await this.findCurrentStep(document);

    if (!step) {
      throw new ConflictException(
        'There is no pending approval step on this document',
      );
    }

    if (expectedStepType && step.stepType !== expectedStepType) {
      throw new ConflictException(
        `The step currently pending is ${step.stepType}, not ${expectedStepType}`,
      );
    }

    if (await this.rbacService.hasAnyRole(userId, APPROVAL_OVERRIDE_ROLES)) {
      return step;
    }

    if (step.assignedEmployee?.userId === userId) {
      return step;
    }

    if (step.assignedRoleName) {
      const roles = await this.rbacService.getUserRoleNames(userId);

      if (roles.includes(step.assignedRoleName)) {
        return step;
      }
    }

    throw new ForbiddenException('This approval step is not yours to act on');
  }

  /** Documents waiting on the user, for the approval inbox page. */
  async listPendingStepsForUser(userId: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId },
      select: { id: true },
    });

    const roles = await this.rbacService.getUserRoleNames(userId);

    const assignedToUser = [
      ...(employee ? [{ assignedEmployeeId: employee.id }] : []),
      ...(roles.length > 0 ? [{ assignedRoleName: { in: roles } }] : []),
    ];

    if (assignedToUser.length === 0) {
      return [];
    }

    return this.prisma.claimApprovalStep.findMany({
      where: {
        status: 'PENDING',
        OR: assignedToUser,
        // Any document type, as long as it belongs to the active company.
        AND: [
          {
            OR: [
              { claim: { companyId } },
              { pettyCashBatch: { companyId } },
              { cashAdvance: { companyId } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        claim: {
          select: {
            id: true,
            claimNumber: true,
            status: true,
            submittedAmount: true,
            periodStart: true,
            periodEnd: true,
            employee: { select: { name: true, employeeCode: true } },
          },
        },
        pettyCashBatch: {
          select: {
            id: true,
            batchNumber: true,
            status: true,
            totalAmount: true,
            periodStart: true,
            periodEnd: true,
          },
        },
        cashAdvance: {
          select: {
            id: true,
            advanceNumber: true,
            status: true,
            amount: true,
            type: true,
            employee: { select: { name: true, employeeCode: true } },
          },
        },
      },
    });
  }

  /**
   * The most specific rule matching the document.
   *
   * Matching is deliberately data-driven rather than hard-coded, because the
   * Onduline approval matrix differs per division, level, and region, and is
   * still changing.
   */
  private async findMatchingRule(input: BuildStepsInput) {
    const rules = await this.prisma.approvalRule.findMany({
      where: {
        companyId: input.companyId,
        documentType: input.document.documentType,
        isActive: true,
        OR: [{ claimantLevel: null }, { claimantLevel: input.claimant.level }],
        AND: [
          {
            OR: [
              { claimantDivision: null },
              { claimantDivision: input.claimant.division },
            ],
          },
        ],
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
      orderBy: { priority: 'desc' },
    });

    const match = rules.find((rule) => {
      const aboveMin =
        rule.minAmount === null || input.amount >= Number(rule.minAmount);
      const belowMax =
        rule.maxAmount === null || input.amount <= Number(rule.maxAmount);

      return aboveMin && belowMax && rule.steps.length > 0;
    });

    if (!match) {
      throw new BadRequestException(
        'No approval rule matches this document yet. Complete the Approval Rule master data first.',
      );
    }

    return match;
  }

  /**
   * Pulls the requester's superiors from master data, for steps whose approver
   * is determined by position.
   */
  private async loadSupervisors(claimant: ApprovalClaimant): Promise<{
    departmentHeadId: string | null;
    regionalManagerId: string | null;
  }> {
    const [department, salesArea] = await Promise.all([
      claimant.departmentId
        ? this.prisma.department.findUnique({
            where: { id: claimant.departmentId },
            select: { headEmployeeId: true },
          })
        : Promise.resolve(null),
      claimant.salesAreaId
        ? this.prisma.salesArea.findUnique({
            where: { id: claimant.salesAreaId },
            select: { managerEmployeeId: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      departmentHeadId: department?.headEmployeeId ?? null,
      regionalManagerId: salesArea?.managerEmployeeId ?? null,
    };
  }

  /**
   * Determines who carries out a step.
   *
   * If the referenced superior is not filled in in master data, or turns out
   * to be the same person as the requester, the process stops with a clear
   * message. Carrying on silently would produce a document nobody can approve,
   * or one the requester approves for themselves.
   */
  private resolveAssignment(
    step: {
      approverType: string;
      approverEmployeeId: string | null;
      approverRoleName: string | null;
      sequence: number;
    },
    claimant: ApprovalClaimant,
    supervisors: {
      departmentHeadId: string | null;
      regionalManagerId: string | null;
    },
    ruleName: string,
  ): {
    assignedEmployeeId: string | null;
    assignedRoleName: string | null;
    skip: boolean;
  } {
    const fail = (reason: string): never => {
      throw new BadRequestException(
        `Approval rule "${ruleName}" step ${step.sequence}: ${reason}`,
      );
    };

    // An org-chart step (review by the HOD or the regional manager) is skipped
    // when the requester's org data is not filled in yet, instead of blocking
    // the whole submission. This keeps a self-provisioned account — which has
    // no department or sales area until the master data is completed — able to
    // submit a claim: it simply flows on to the role-based steps (Finance
    // accrual, director approval, Finance posting). The step is recorded as
    // SKIPPED so the trail still shows it was bypassed.
    const skip = () => ({
      assignedEmployeeId: null,
      assignedRoleName: null,
      skip: true,
    });

    let employeeId: string | null = null;
    let roleName: string | null = null;

    switch (step.approverType) {
      case 'SPECIFIC_EMPLOYEE':
        employeeId =
          step.approverEmployeeId ?? fail('approver employee is not set yet');
        break;

      case 'DEPARTMENT_HEAD':
        // No department, or the department has no HOD: the review cannot be
        // assigned to anyone, so it is skipped rather than failing.
        if (claimant.departmentId === null || !supervisors.departmentHeadId) {
          return skip();
        }

        employeeId = supervisors.departmentHeadId;
        break;

      case 'REGIONAL_MANAGER':
        if (claimant.salesAreaId === null || !supervisors.regionalManagerId) {
          return skip();
        }

        employeeId = supervisors.regionalManagerId;
        break;

      case 'ROLE':
        roleName =
          step.approverRoleName ?? fail('approver role is not set yet');
        break;

      default:
        return fail(`approver type "${step.approverType}" is not recognised`);
    }

    // A resolved org-chart approver who turns out to be the requester cannot
    // review their own document, so the review step is skipped and the chain
    // moves on to the role-based approvals rather than stalling.
    if (employeeId !== null && employeeId === claimant.employeeId) {
      return skip();
    }

    return {
      assignedEmployeeId: employeeId,
      assignedRoleName: roleName,
      skip: false,
    };
  }
}
