/** A single line item extracted from an invoice document. */
export interface ExtractedInvoiceLine {
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  taxAmount?: number | null;
  lineTotal?: number | null;
}

/** Structured invoice data extracted from a document. */
export interface ExtractedInvoice {
  invoiceNumber?: string | null;
  vendorName?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  poNumber?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  lineItems: ExtractedInvoiceLine[];
}

export interface ExtractionResult {
  invoice: ExtractedInvoice;
  /** Provider confidence, 0..1. `null` when the provider does not report it. */
  confidence: number | null;
}
