const ONE_DECIMAL = /^-?\d+(\.\d)?$/;

/** Percent input with at most one digit after the decimal (e.g. 2.1). */
export function parsePercentOneDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  if (!ONE_DECIMAL.test(t)) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}
