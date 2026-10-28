const UNIT_TO_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Converts an `ms` style duration (`'15m'`, `'7d'`, `'3600'`) to milliseconds.
 * A bare number is treated as seconds, following the JWT `expiresIn`
 * convention.
 *
 * @throws {Error} when the format is not recognised.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(duration.trim());

  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Use something like 30s, 15m, 12h, or 7d.`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();

  return unit ? value * UNIT_TO_MS[unit] : value * UNIT_TO_MS.s;
}
