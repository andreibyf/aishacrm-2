/**
 * Finance Ops display-formatting helpers.
 *
 * Money is STORED and TRANSPORTED as integer minor units (cents) — the canonical
 * accounting representation, which avoids floating-point drift (0.1 + 0.2 ≠ 0.3).
 * `formatCentsAmount` is the read-only DISPLAY shim used by the Finance Ops tables:
 * it places the decimal point two digits from the right and adds thousands
 * separators, e.g. `250000 -> "2,500.00"`. The underlying value stays in cents.
 *
 * It deliberately omits a currency symbol because the finance tables render the
 * currency in its own column (e.g. "2,500.00" + "usd"). For a $-prefixed render,
 * use `formatCents` in `billingFormatters.js` / `LedgerSummary.jsx` instead.
 *
 * Returns `null` for missing / non-finite input so callers (FinanceTablePanel)
 * fall back to the shared '—' empty glyph rather than printing "NaN".
 */
const AMOUNT_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @param {number|string|null|undefined} cents integer minor units
 * @returns {string|null} e.g. 250000 -> "2,500.00"; null for missing/non-finite
 */
export function formatCentsAmount(cents) {
  if (cents === null || cents === undefined || cents === '') return null;
  const n = typeof cents === 'number' ? cents : Number(cents);
  if (!Number.isFinite(n)) return null;
  return AMOUNT_FORMAT.format(n / 100);
}

export default formatCentsAmount;
