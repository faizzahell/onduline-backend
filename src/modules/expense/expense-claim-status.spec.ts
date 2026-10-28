import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  assertClaimNotFinal,
  assertClaimRevisable,
  assertClaimTransition,
  assertEntryEditableByClaimant,
} from './expense-claim-status';

describe('expense-claim-status', () => {
  describe('assertClaimTransition', () => {
    it('allows the normal flow from submit through posting', () => {
      expect(() => assertClaimTransition('DRAFT', 'SUBMITTED')).not.toThrow();
      expect(() => assertClaimTransition('SUBMITTED', 'ACCRUED')).not.toThrow();
      expect(() =>
        assertClaimTransition('ACCRUED', 'UNDER_REVIEW'),
      ).not.toThrow();
      expect(() =>
        assertClaimTransition('UNDER_REVIEW', 'APPROVED'),
      ).not.toThrow();
      expect(() => assertClaimTransition('APPROVED', 'POSTED')).not.toThrow();
    });

    it('rejects posting before approval', () => {
      expect(() => assertClaimTransition('SUBMITTED', 'POSTED')).toThrow(
        ConflictException,
      );
    });

    it('treats POSTED as a final status', () => {
      expect(() => assertClaimTransition('POSTED', 'APPROVED')).toThrow(
        ConflictException,
      );
    });

    it('allows a revised claim to be submitted again', () => {
      expect(() =>
        assertClaimTransition('REVISION_REQUESTED', 'SUBMITTED'),
      ).not.toThrow();
    });
  });

  describe('assertEntryEditableByClaimant', () => {
    it('allows entries that do not belong to a claim yet', () => {
      expect(() => assertEntryEditableByClaimant(null)).not.toThrow();
    });

    it('locks entries whose claim has already been submitted', () => {
      expect(() => assertEntryEditableByClaimant('SUBMITTED')).toThrow(
        ConflictException,
      );
    });

    it('reopens entries when the claim is sent back for revision', () => {
      expect(() =>
        assertEntryEditableByClaimant('REVISION_REQUESTED'),
      ).not.toThrow();
    });
  });

  describe('assertClaimNotFinal', () => {
    it('rejects changes to a claim that has been posted', () => {
      expect(() => assertClaimNotFinal('POSTED')).toThrow(ConflictException);
    });
  });

  describe('assertClaimRevisable', () => {
    it('allows revising amounts while the claim is still in progress', () => {
      expect(() => assertClaimRevisable('ACCRUED')).not.toThrow();
    });

    it('rejects revising amounts after the claim is approved', () => {
      expect(() => assertClaimRevisable('APPROVED')).toThrow(ConflictException);
    });
  });
});
