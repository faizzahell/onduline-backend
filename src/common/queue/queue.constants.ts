/** BullMQ queue that extracts data from invoice documents. */
export const OCR_QUEUE = 'ocr-processing';

/** Job name inside {@link OCR_QUEUE}. */
export const OCR_PROCESS_INVOICE_JOB = 'process-invoice';

/** Payload of the {@link OCR_PROCESS_INVOICE_JOB} job. */
export interface OcrJobPayload {
  ocrJobId: string;
  invoiceId: string;
  invoiceFileId: string;
}

/**
 * Queue that extracts data from expense receipts.
 *
 * Kept separate from {@link OCR_QUEUE} so that the much larger volume of
 * receipts never delays invoice processing, even though both engines share the
 * same shape.
 */
export const EXPENSE_OCR_QUEUE = 'expense-ocr-processing';

export const EXPENSE_OCR_JOB = 'process-receipt';

export interface ExpenseOcrJobPayload {
  expenseOcrJobId: string;
}
