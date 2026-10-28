import type { ExtractionResult } from '../dto/invoice-extraction.dto';

/** DI token for {@link InvoiceExtractionProvider}. */
export const INVOICE_EXTRACTION_PROVIDER = Symbol(
  'INVOICE_EXTRACTION_PROVIDER',
);

/**
 * Turns an invoice file into structured data.
 *
 * This abstraction decouples the OCR worker from the AI vendor in use, so the
 * provider can be swapped through `OcrInvoiceModule` without touching the
 * processor.
 */
export interface InvoiceExtractionProvider {
  /** Provider identifier recorded in `OCRJob.provider`. */
  getProviderName(): string;

  /** Model identifier recorded in `OCRJob.model`. */
  getModelName(): string;

  extractFromFile(
    absolutePath: string,
    mimeType: string,
  ): Promise<ExtractionResult>;
}
