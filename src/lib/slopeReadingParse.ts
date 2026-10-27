/** Up to two digits after the decimal (e.g. 2.65). */
const TWO_DECIMALS = /^-?\d+(\.\d{1,2})?$/;
/** Incomplete while typing (not yet a finished value). */
const PARTIAL_PERCENT = /^-?\d*\.?$|^-?\d+\.\d?$/;

/** Slope % input: integers or up to two decimal places (e.g. 2, 2.1, 2.65). */
export function parsePercentOneDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  if (!TWO_DECIMALS.test(t)) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/** True when the field has text that isn't a finished % yet (don't flash red mid-type). */
export function isPercentInputPartial(raw: string): boolean {
  const t = raw.trim().replace(",", ".");
  if (!t) return false;
  if (parsePercentOneDecimal(t) != null) return false;
  return PARTIAL_PERCENT.test(t);
}
