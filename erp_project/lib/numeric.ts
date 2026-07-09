// Shared numeric normalization for rate/MOQ fields across RM and PM masters.
// Applied at every DB write site (create, bulk import, and approval apply) so
// the business rule holds regardless of which path a value came in through.

/** MOQ is always a whole unit count — round away any fractional input. */
export function roundToWholeNumber(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Rates are stored/displayed to exactly 2 decimal places (currency). */
export function roundToTwoDecimals(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}
