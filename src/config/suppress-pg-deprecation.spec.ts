import { afterEach, describe, expect, it, vi } from 'vitest';

import { suppressPgQueryDeprecation } from './suppress-pg-deprecation';

/** Builds a warning whose stack places it inside @prisma/adapter-pg. */
function adapterPgWarning(): Error {
  const warning = new Error(
    'Calling client.query() when the client is already executing a query is deprecated',
  );
  warning.name = 'DeprecationWarning';
  warning.stack =
    'DeprecationWarning: ...\n    at PgTransaction.queryRaw (node_modules/@prisma/adapter-pg/dist/index.mjs:595:41)';
  return warning;
}

describe('suppressPgQueryDeprecation', () => {
  afterEach(() => {
    process.removeAllListeners('warning');
  });

  it('swallows the adapter-pg query deprecation', () => {
    const seen: Error[] = [];
    process.on('warning', (warning) => seen.push(warning));

    suppressPgQueryDeprecation();
    process.emit('warning', adapterPgWarning());

    expect(seen).toHaveLength(0);
  });

  it('still forwards every other warning to the existing listeners', () => {
    const seen: Error[] = [];
    process.on('warning', (warning) => seen.push(warning));

    suppressPgQueryDeprecation();

    const other = new Error('something else entirely');
    other.name = 'DeprecationWarning';
    process.emit('warning', other);

    expect(seen).toHaveLength(1);
    expect(seen[0].message).toBe('something else entirely');
  });

  it('does not swallow a similar message from a different source', () => {
    const seen: Error[] = [];
    process.on('warning', (warning) => seen.push(warning));

    suppressPgQueryDeprecation();

    const lookalike = new Error('client is already executing a query');
    lookalike.name = 'DeprecationWarning';
    lookalike.stack = 'DeprecationWarning: ...\n    at somewhere/else.js:1:1';
    process.emit('warning', lookalike);

    expect(seen).toHaveLength(1);
  });

  it('falls back to console.warn when there were no prior listeners', () => {
    process.removeAllListeners('warning');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    suppressPgQueryDeprecation();

    const other = new Error('standalone warning');
    other.name = 'Warning';
    process.emit('warning', other);

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
