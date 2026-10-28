import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  type CategoryBehaviour,
  calculateEntryAmount,
  countInclusiveDays,
  needsPerTransactionApproval,
} from './expense-entry-calculator';

function behaviour(
  overrides: Partial<CategoryBehaviour> = {},
): CategoryBehaviour {
  return {
    name: 'Gasoline',
    isMealAllowance: false,
    isFixedRate: false,
    isEntertainment: false,
    requiresProof: true,
    requiresDestination: false,
    requiresMarketingCode: false,
    perTransactionApprovalThreshold: null,
    ...overrides,
  };
}

describe('countInclusiveDays', () => {
  it('counts 11-15 August as 5 days', () => {
    expect(
      countInclusiveDays(new Date('2026-08-11'), new Date('2026-08-15')),
    ).toBe(5);
  });

  it('counts the same date as 1 day', () => {
    expect(
      countInclusiveDays(new Date('2026-08-11'), new Date('2026-08-11')),
    ).toBe(1);
  });

  it('rejects a reversed range', () => {
    expect(() =>
      countInclusiveDays(new Date('2026-08-15'), new Date('2026-08-11')),
    ).toThrow(BadRequestException);
  });
});

describe('calculateEntryAmount', () => {
  describe('meal allowance', () => {
    const category = behaviour({
      name: 'Meal Allowance',
      isMealAllowance: true,
      isFixedRate: true,
      requiresProof: false,
    });

    it('multiplies the day count by the master rate', () => {
      expect(
        calculateEntryAmount(category, {
          effectiveRate: 150_000,
          mealDays: 5,
        }),
      ).toEqual({ quantity: 5, unitPrice: 150_000, amount: 750_000 });
    });

    it('ignores the amount sent by the client and uses the master rate', () => {
      const result = calculateEntryAmount(category, {
        unitPrice: 999_999,
        effectiveRate: 150_000,
        mealDays: 2,
      });

      expect(result.unitPrice).toBe(150_000);
      expect(result.amount).toBe(300_000);
    });

    it('rejects when no rate has been set in the master data', () => {
      expect(() =>
        calculateEntryAmount(category, { effectiveRate: null, mealDays: 3 }),
      ).toThrow(/no rate is in effect/);
    });

    it('rejects when the date range is not sent', () => {
      expect(() =>
        calculateEntryAmount(category, { effectiveRate: 150_000 }),
      ).toThrow(/travel date range/);
    });
  });

  describe('regular categories', () => {
    it('multiplies quantity by unit price', () => {
      expect(
        calculateEntryAmount(behaviour(), {
          quantity: 3,
          unitPrice: 25_000,
          effectiveRate: null,
        }),
      ).toEqual({ quantity: 3, unitPrice: 25_000, amount: 75_000 });
    });

    it('uses a quantity of 1 when none is sent', () => {
      expect(
        calculateEntryAmount(behaviour(), {
          unitPrice: 50_000,
          effectiveRate: null,
        }).quantity,
      ).toBe(1);
    });

    it('rejects a missing amount', () => {
      expect(() =>
        calculateEntryAmount(behaviour(), { effectiveRate: null }),
      ).toThrow(/The expense amount is required/);
    });

    it('rejects a zero or negative amount', () => {
      expect(() =>
        calculateEntryAmount(behaviour(), {
          unitPrice: 0,
          effectiveRate: null,
        }),
      ).toThrow(BadRequestException);
    });
  });
});

describe('needsPerTransactionApproval', () => {
  const entertainment = behaviour({
    name: 'Entertainment',
    isEntertainment: true,
    perTransactionApprovalThreshold: 500_000,
  });

  it('requires approval for entertainment above IDR 500,000', () => {
    expect(needsPerTransactionApproval(entertainment, 500_001)).toBe(true);
  });

  it('does not require approval exactly at the threshold', () => {
    expect(needsPerTransactionApproval(entertainment, 500_000)).toBe(false);
  });

  it('does not apply to categories without a threshold', () => {
    expect(needsPerTransactionApproval(behaviour(), 10_000_000)).toBe(false);
  });
});
