/**
 * Silences one specific, harmless deprecation warning from the `pg` driver.
 *
 * `@prisma/adapter-pg` (7.10) issues a query inside an interactive transaction
 * while the connection is still settling the previous one. `pg` 8 answers that
 * with:
 *
 *   DeprecationWarning: Calling client.query() when the client is already
 *   executing a query is deprecated ...
 *
 * The transaction still commits correctly — this is an internal timing detail
 * of the adapter, not a bug in our code, and there is nothing at our layer
 * (pool config included) that prevents it. Until the adapter is fixed
 * upstream, the warning is filtered out so it does not drown the logs, while
 * every other process warning is still forwarded untouched.
 *
 * Remove this once `@prisma/adapter-pg` no longer triggers it.
 */
export function suppressPgQueryDeprecation(): void {
  const isAdapterPgQueryDeprecation = (warning: Error): boolean =>
    warning.name === 'DeprecationWarning' &&
    warning.message.includes('client is already executing a query') &&
    (warning.stack?.includes('@prisma/adapter-pg') ?? false);

  const original = process.listeners('warning');

  process.removeAllListeners('warning');

  process.on('warning', (warning) => {
    if (isAdapterPgQueryDeprecation(warning)) {
      return;
    }

    if (original.length === 0) {
      // Reproduce Node's default behaviour for every other warning.
      console.warn(warning.stack ?? warning.message);
      return;
    }

    for (const listener of original) {
      listener(warning);
    }
  });
}
