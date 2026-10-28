/**
 * The company currently active for a request, as resolved by
 * `CompanyAccessGuard`.
 */
export interface CompanyContext {
  id: string;
  code: string;
  name: string;
  /** This company's local bookkeeping currency. */
  currency: string;
  /** Invoice OCR is enabled per company by a super administrator. */
  ocrInvoiceEnabled: boolean;
  /** Expense receipt OCR is enabled per company by a super administrator. */
  ocrExpenseEnabled: boolean;
}

/** The header clients use to pick the active company. */
export const COMPANY_HEADER = 'x-company-id';
