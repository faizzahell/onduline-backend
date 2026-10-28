import { describe, expect, it } from 'vitest';

import { calculateMatchScorePercent } from './po-matching';

describe('calculateMatchScorePercent', () => {
  it('gives a full score when the amount and vendor are identical', () => {
    expect(
      calculateMatchScorePercent({
        invoiceTotal: 185_400_000,
        invoiceVendorName: 'PT Sinar Baja Logam',
        poTotal: 185_400_000,
        poVendorName: 'PT Sinar Baja Logam',
      }),
    ).toBe(100);
  });

  it('ignores legal forms when comparing vendor names', () => {
    const withLegalForm = calculateMatchScorePercent({
      invoiceTotal: 1_000,
      invoiceVendorName: 'CV Mitra Kimia Nusantara',
      poTotal: 1_000,
      poVendorName: 'Mitra Kimia Nusantara',
    });

    expect(withLegalForm).toBe(100);
  });

  it('lowers the score as the amount gap widens', () => {
    const closeMatch = calculateMatchScorePercent({
      invoiceTotal: 95_000,
      invoiceVendorName: 'Sinar Baja',
      poTotal: 100_000,
      poVendorName: 'Sinar Baja',
    });

    const farMatch = calculateMatchScorePercent({
      invoiceTotal: 20_000,
      invoiceVendorName: 'Sinar Baja',
      poTotal: 100_000,
      poVendorName: 'Sinar Baja',
    });

    expect(closeMatch).toBeGreaterThan(farMatch);
  });

  it('still gives a middling score when the invoice amount is unknown', () => {
    const score = calculateMatchScorePercent({
      invoiceTotal: null,
      invoiceVendorName: 'Sinar Baja Logam',
      poTotal: 100_000,
      poVendorName: 'Sinar Baja Logam',
    });

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  it('gives a low score for a completely different vendor', () => {
    const score = calculateMatchScorePercent({
      invoiceTotal: 10_000,
      invoiceVendorName: 'Mitra Kimia Nusantara',
      poTotal: 900_000,
      poVendorName: 'Sinar Baja Logam',
    });

    expect(score).toBeLessThan(20);
  });
});
