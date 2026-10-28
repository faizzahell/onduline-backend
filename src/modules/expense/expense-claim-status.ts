import { ConflictException } from '@nestjs/common';

export const CLAIM_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCRUED',
  'UNDER_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'POSTED',
  'CANCELLED',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * Expense claim status flow.
 *
 * Follows the requirement: `Create → accrued to BC → Submit → review →
 * Approval → Post reversal`. Accrual happens after submission and is handled
 * by the finance team, not by the claimant.
 */
const ALLOWED_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ACCRUED', 'REVISION_REQUESTED', 'CANCELLED'],
  ACCRUED: ['UNDER_REVIEW', 'APPROVED', 'REVISION_REQUESTED'],
  UNDER_REVIEW: ['APPROVED', 'REVISION_REQUESTED'],
  REVISION_REQUESTED: ['SUBMITTED', 'CANCELLED'],
  APPROVED: ['POSTED', 'REVISION_REQUESTED'],
  POSTED: [],
  CANCELLED: [],
};

/** Statuses that stop the claimant from editing the expense entries. */
const LOCKED_FOR_CLAIMANT: readonly ClaimStatus[] = [
  'SUBMITTED',
  'ACCRUED',
  'UNDER_REVIEW',
  'APPROVED',
  'POSTED',
];

/** Final statuses: neither the amounts nor the contents may change. */
const FINAL_STATUSES: readonly ClaimStatus[] = ['POSTED', 'CANCELLED'];

export function assertClaimTransition(
  from: ClaimStatus,
  to: ClaimStatus,
): void {
  if (from === to) {
    return;
  }

  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(
      `A claim with status ${from} cannot be moved to ${to}`,
    );
  }
}

/**
 * Entries that already belong to a claim are locked for the claimant, unless
 * the claim has been sent back for revision.
 */
export function assertEntryEditableByClaimant(
  claimStatus: ClaimStatus | null,
): void {
  if (claimStatus !== null && LOCKED_FOR_CLAIMANT.includes(claimStatus)) {
    throw new ConflictException(
      `This entry already belongs to a claim with status ${claimStatus} and cannot be changed`,
    );
  }
}

export function assertClaimNotFinal(status: ClaimStatus): void {
  if (FINAL_STATUSES.includes(status)) {
    throw new ConflictException(
      `A claim with status ${status} is final and cannot be changed`,
    );
  }
}

/** A reviewer may only revise amounts while the claim is still in progress. */
export function assertClaimRevisable(status: ClaimStatus): void {
  const revisable: readonly ClaimStatus[] = [
    'SUBMITTED',
    'ACCRUED',
    'UNDER_REVIEW',
  ];

  if (!revisable.includes(status)) {
    throw new ConflictException(
      `The amounts of a claim with status ${status} cannot be revised`,
    );
  }
}
