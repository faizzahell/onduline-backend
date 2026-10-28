export type ApprovalDocumentType =
  'EXPENSE_CLAIM' | 'PETTY_CASH_BATCH' | 'CASH_ADVANCE';

/**
 * The role a step plays.
 *
 * `ACCRUE` and `POST` are handled by the finance team and are not
 * approve/reject decisions, but they remain steps so the ordering is preserved
 * and it is recorded who carried them out.
 */
export type ApprovalStepType = 'ACCRUE' | 'REVIEW' | 'APPROVE' | 'POST';

export type ApproverType =
  'SPECIFIC_EMPLOYEE' | 'DEPARTMENT_HEAD' | 'REGIONAL_MANAGER' | 'ROLE';

export type ApprovalStepStatus =
  'PENDING' | 'APPROVED' | 'REVISION_REQUESTED' | 'SKIPPED';

export type EmployeeLevel = 'STAFF' | 'MANAGER' | 'DIRECTOR';
export type EmployeeDivision = 'SALES' | 'NON_SALES';

/** The document currently going through approval. */
export type ApprovalDocumentRef =
  | { documentType: 'EXPENSE_CLAIM'; claimId: string }
  | { documentType: 'PETTY_CASH_BATCH'; pettyCashBatchId: string }
  | { documentType: 'CASH_ADVANCE'; cashAdvanceId: string };

/** Requester profile, used to match rules and resolve superiors. */
export interface ApprovalClaimant {
  employeeId: string;
  level: EmployeeLevel;
  division: EmployeeDivision;
  departmentId: string | null;
  salesAreaId: string | null;
}

export function toDocumentWhere(ref: ApprovalDocumentRef) {
  switch (ref.documentType) {
    case 'EXPENSE_CLAIM':
      return { claimId: ref.claimId };
    case 'PETTY_CASH_BATCH':
      return { pettyCashBatchId: ref.pettyCashBatchId };
    case 'CASH_ADVANCE':
      return { cashAdvanceId: ref.cashAdvanceId };
  }
}
