import { describe, expect, it } from 'vitest';

import { parseDurationToMs } from './duration.util';

describe('parseDurationToMs', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['12h', 43_200_000],
    ['7d', 604_800_000],
  ])('parses %s', (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it('treats a bare number as seconds', () => {
    expect(parseDurationToMs('3600')).toBe(3_600_000);
  });

  it('rejects an unrecognised format', () => {
    expect(() => parseDurationToMs('2 weeks')).toThrowError(
      /Invalid duration format/,
    );
  });
});
