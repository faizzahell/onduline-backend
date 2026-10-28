import { BadRequestException } from '@nestjs/common';

const MILLISECONDS_PER_DAY = 86_400_000;

/** Category traits that affect how an entry is calculated and validated. */
export interface CategoryBehaviour {
  name: string;
  isMealAllowance: boolean;
  isFixedRate: boolean;
  isEntertainment: boolean;
  requiresProof: boolean;
  requiresDestination: boolean;
  requiresMarketingCode: boolean;
  perTransactionApprovalThreshold: number | null;
}

export interface AmountInput {
  quantity?: number;
  unitPrice?: number;
  /** Fixed rate in effect on the expense date, when there is one. */
  effectiveRate: number | null;
  /** Meal allowance day count, already derived from the date range. */
  mealDays?: number;
}

export interface AmountResult {
  quantity: number;
  unitPrice: number;
  amount: number;
}

/**
 * Inclusive number of days between two dates.
 *
 * A trip from 11 to 15 August counts as 5 days, matching the example in the
 * requirement.
 */
export function countInclusiveDays(start: Date, end: Date): number {
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );

  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );

  if (endUtc < startUtc) {
    throw new BadRequestException(
      'The meal allowance end date cannot be earlier than the start date',
    );
  }

  return Math.round((endUtc - startUtc) / MILLISECONDS_PER_DAY) + 1;
}

/**
 * Determines the quantity, unit price, and total of an entry.
 *
 * Three different treatments:
 * - meal allowance: quantity from the day count, price from the master rate
 * - other fixed-rate categories: price from the master rate, quantity from input
 * - regular categories: quantity and price from input
 *
 * Rates come from the master data rather than from client input, so users
 * cannot change amounts that are set by policy.
 */
export function calculateEntryAmount(
  category: CategoryBehaviour,
  input: AmountInput,
): AmountResult {
  if (category.isMealAllowance) {
    if (!input.mealDays) {
      throw new BadRequestException(
        'Meal allowance requires the travel date range',
      );
    }

    const rate = requireRate(category, input.effectiveRate);

    return {
      quantity: input.mealDays,
      unitPrice: rate,
      amount: round2(input.mealDays * rate),
    };
  }

  const quantity = input.quantity ?? 1;

  if (quantity <= 0) {
    throw new BadRequestException('Quantity must be greater than zero');
  }

  if (category.isFixedRate) {
    const rate = requireRate(category, input.effectiveRate);

    return { quantity, unitPrice: rate, amount: round2(quantity * rate) };
  }

  const unitPrice = input.unitPrice;

  if (unitPrice === undefined || unitPrice === null) {
    throw new BadRequestException('The expense amount is required');
  }

  if (unitPrice <= 0) {
    throw new BadRequestException('The amount must be greater than zero');
  }

  return { quantity, unitPrice, amount: round2(quantity * unitPrice) };
}

/** Entertainment above the category threshold needs per-transaction approval. */
export function needsPerTransactionApproval(
  category: CategoryBehaviour,
  amount: number,
): boolean {
  if (category.perTransactionApprovalThreshold === null) {
    return false;
  }

  return amount > category.perTransactionApprovalThreshold;
}

function requireRate(
  category: CategoryBehaviour,
  effectiveRate: number | null,
): number {
  if (effectiveRate === null) {
    throw new BadRequestException(
      `Category "${category.name}" uses a fixed rate, but no rate is in effect on that date. Complete the rate master data first.`,
    );
  }

  return effectiveRate;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
