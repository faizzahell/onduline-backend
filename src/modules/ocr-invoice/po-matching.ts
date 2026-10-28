/** Legal-form tokens that do not distinguish one vendor from another. */
const LEGAL_FORM_TOKENS = new Set([
  'pt',
  'cv',
  'ud',
  'tbk',
  'persero',
  'co',
  'ltd',
  'inc',
  'sdn',
  'bhd',
]);

const AMOUNT_WEIGHT = 0.6;
const VENDOR_WEIGHT = 0.4;

/** Used when the invoice amount is still unknown, so the PO is not discarded outright. */
const UNKNOWN_SCORE = 0.5;

export interface MatchScoreInput {
  invoiceTotal: number | null;
  invoiceVendorName: string | null;
  poTotal: number;
  poVendorName: string;
}

/**
 * A heuristic match score between an OCR-extracted invoice and a purchase
 * order, as a percentage with one decimal place.
 *
 * The score only serves to rank candidates in the PO resolution UI. The actual
 * 3-way match decision still belongs to the reviewer.
 */
export function calculateMatchScorePercent(input: MatchScoreInput): number {
  const amountScore = scoreAmount(input.invoiceTotal, input.poTotal);

  const vendorScore = scoreVendorName(
    input.invoiceVendorName,
    input.poVendorName,
  );

  const score = amountScore * AMOUNT_WEIGHT + vendorScore * VENDOR_WEIGHT;

  return Math.round(score * 1000) / 10;
}

function scoreAmount(invoiceTotal: number | null, poTotal: number): number {
  if (invoiceTotal === null || invoiceTotal <= 0 || poTotal <= 0) {
    return UNKNOWN_SCORE;
  }

  const relativeGap =
    Math.abs(invoiceTotal - poTotal) / Math.max(invoiceTotal, poTotal);

  return Math.max(0, 1 - relativeGap);
}

function scoreVendorName(
  invoiceVendorName: string | null,
  poVendorName: string,
): number {
  const invoiceTokens = tokenizeVendorName(invoiceVendorName);
  const poTokens = tokenizeVendorName(poVendorName);

  if (invoiceTokens.length === 0 || poTokens.length === 0) {
    return UNKNOWN_SCORE;
  }

  const poTokenSet = new Set(poTokens);
  const shared = invoiceTokens.filter((token) => poTokenSet.has(token)).length;

  return shared / Math.max(invoiceTokens.length, poTokens.length);
}

function tokenizeVendorName(vendorName: string | null): string[] {
  if (!vendorName) {
    return [];
  }

  return vendorName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !LEGAL_FORM_TOKENS.has(token));
}
