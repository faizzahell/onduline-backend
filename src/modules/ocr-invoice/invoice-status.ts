import { ConflictException } from '@nestjs/common';

export const INVOICE_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'EXTRACTED',
  'VALIDATION_REQUIRED',
  'VALIDATED',
  'MATCHED',
  'SUBMITTED',
  'POSTED',
  'FAILED',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * The allowed status transitions.
 *
 * The normal flow: uploading a file triggers `PROCESSING`, the worker writes
 * `EXTRACTED`, a reviewer moves it up to `VALIDATED` and then `MATCHED`, and
 * finally the invoice is submitted to Business Central.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  UPLOADED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['EXTRACTED', 'VALIDATION_REQUIRED', 'FAILED'],
  EXTRACTED: ['VALIDATION_REQUIRED', 'VALIDATED', 'PROCESSING', 'FAILED'],
  VALIDATION_REQUIRED: ['VALIDATED', 'PROCESSING', 'FAILED'],
  VALIDATED: ['MATCHED', 'VALIDATION_REQUIRED', 'PROCESSING', 'FAILED'],
  MATCHED: ['SUBMITTED', 'VALIDATED', 'PROCESSING', 'FAILED'],
  SUBMITTED: ['POSTED', 'FAILED'],
  POSTED: [],
  FAILED: ['PROCESSING'],
};

/** Statuses already handed over to Business Central, which may no longer change. */
const LOCKED_STATUSES: readonly InvoiceStatus[] = ['SUBMITTED', 'POSTED'];

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransitionAllowed(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `An invoice with status ${from} cannot be moved to ${to}`,
    );
  }
}

/** An invoice may be edited as long as it has not been sent to Business Central. */
export function assertEditable(status: InvoiceStatus): void {
  if (LOCKED_STATUSES.includes(status)) {
    throw new ConflictException(
      `An invoice with status ${status} is locked and cannot be changed`,
    );
  }
}

/** New files cannot be added while OCR is running. */
export function assertAcceptsNewFile(status: InvoiceStatus): void {
  assertEditable(status);

  if (status === 'PROCESSING') {
    throw new ConflictException(
      'The invoice is being processed by OCR, wait until it finishes before uploading another file',
    );
  }
}
