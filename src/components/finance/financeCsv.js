/**
 * Finance Ops CSV export helpers (Beta Exports slice).
 *
 * Column-aware serialization so exports match the on-screen panel exactly:
 * the header is the column *label* and each cell is the column's rendered value
 * (`render(row)` when present, else `row[key]`). This is intentionally distinct
 * from the generic `src/components/shared/CsvExportButton.jsx`, which derives
 * headers from `Object.keys(data[0])` and is not label/`render`-aware.
 *
 * Pure + frontend-only: exports can only contain data the gated, tenant-scoped
 * read API already returned and the UI already displayed. No backend, no
 * mutation, no secrets.
 */

function valueToString(v) {
  return v === null || v === undefined || v === '' ? '' : String(v);
}

/**
 * The placeholder the read-only tables render for an empty/null cell
 * (`FinanceTablePanel`, `AuditTimelinePanel`, `EvidencePlaceholder`). Exports
 * use the SAME glyph so a CSV cell matches the displayed cell exactly ("match
 * what beta users see"). Note: this is a human-recordkeeping export — an em
 * dash, not a blank, is intentional for display parity.
 */
export const EMPTY_DISPLAY = '—';

/** Render a value the way the UI cell does: empty/null/undefined -> '—'. */
export function displayCell(v) {
  return v === null || v === undefined || v === '' ? EMPTY_DISPLAY : String(v);
}

/**
 * Turn displayed columns + rows into labeled records, mirroring the on-screen
 * cell text (including the '—' empty placeholder) so the export matches the
 * displayed table.
 * @param {Array<{key:string,label:string,render?:(row)=>any}>} columns
 * @param {Array<object>} rows
 * @returns {Array<Record<string,string>>}
 */
export function columnsToRecords(columns, rows) {
  const cols = Array.isArray(columns) ? columns : [];
  return (Array.isArray(rows) ? rows : []).map((row) =>
    Object.fromEntries(
      cols.map((c) => [c.label, displayCell(c.render ? c.render(row) : row[c.key])]),
    ),
  );
}

function escapeCsv(value) {
  const s = valueToString(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialize labeled records to a CSV string (header from the first record's
 * keys). Empty input yields an empty string.
 */
export function recordsToCsv(records) {
  if (!Array.isArray(records) || records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const lines = [
    headers.map(escapeCsv).join(','),
    ...records.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
  ];
  return lines.join('\n');
}

/**
 * `finance-<area>_<tenantShort>_<YYYY-MM-DD>` — no tokens/secrets. The tenant
 * short is the first 8 chars of the UUID (an opaque, non-secret prefix).
 */
export function financeExportFilename(area, tenantId, date = new Date()) {
  const short = String(tenantId || '').slice(0, 8) || 'tenant';
  const ymd = date.toISOString().slice(0, 10);
  return `finance-${area}_${short}_${ymd}`;
}

/**
 * Trigger a browser download of the records as a CSV file. DOM side-effect;
 * exercised via the button test with spies, not unit-tested here.
 */
export function downloadCsv(records, filename) {
  const csv = recordsToCsv(records);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  if (typeof link.remove === 'function') link.remove();
  else if (link.parentNode) link.parentNode.removeChild(link);
}
