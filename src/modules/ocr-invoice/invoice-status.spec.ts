import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  assertAcceptsNewFile,
  assertEditable,
  assertTransitionAllowed,
  canTransition,
} from './invoice-status';

describe('invoice-status', () => {
  describe('canTransition', () => {
    it('allows the normal review flow', () => {
      expect(canTransition('EXTRACTED', 'VALIDATED')).toBe(true);
      expect(canTransition('VALIDATED', 'MATCHED')).toBe(true);
      expect(canTransition('MATCHED', 'SUBMITTED')).toBe(true);
    });

    it('rejects skipping statuses', () => {
      expect(canTransition('UPLOADED', 'MATCHED')).toBe(false);
      expect(canTransition('EXTRACTED', 'SUBMITTED')).toBe(false);
    });

    it('treats POSTED as a final status', () => {
      expect(canTransition('POSTED', 'VALIDATED')).toBe(false);
    });

    it('allows setting the same status again', () => {
      expect(canTransition('VALIDATED', 'VALIDATED')).toBe(true);
    });
  });

  describe('assertTransitionAllowed', () => {
    it('throws ConflictException for an illegal transition', () => {
      expect(() => assertTransitionAllowed('UPLOADED', 'SUBMITTED')).toThrow(
        ConflictException,
      );
    });
  });

  describe('assertEditable', () => {
    it('locks invoices already handed over to Business Central', () => {
      expect(() => assertEditable('SUBMITTED')).toThrow(ConflictException);
      expect(() => assertEditable('POSTED')).toThrow(ConflictException);
    });

    it('allows edits while still under review', () => {
      expect(() => assertEditable('EXTRACTED')).not.toThrow();
    });
  });

  describe('assertAcceptsNewFile', () => {
    it('rejects uploads while OCR is running', () => {
      expect(() => assertAcceptsNewFile('PROCESSING')).toThrow(
        ConflictException,
      );
    });

    it('allows re-uploading after a failed job', () => {
      expect(() => assertAcceptsNewFile('FAILED')).not.toThrow();
    });
  });
});
