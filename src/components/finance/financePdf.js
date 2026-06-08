/**
 * Finance Ops PDF export helper (Beta Exports slice — PDF follow-up).
 *
 * Client-side PDF of a panel's displayed rows, sibling to financeCsv.js. Takes the
 * SAME `columnsToRecords` output (label -> displayed cell, '—' for empty) so the PDF
 * matches the on-screen table. Pure client-side: no backend, no new endpoint, no
 * secrets, displayed-page only. Mirrors downloadCsv's posture.
 */
import { jsPDF } from 'jspdf';
// jspdf-autotable v5 documents `autoTable` as a NAMED export (it also re-exports it
// as default — both resolve to the same function in 5.x — but the named form is the
// documented, future-proof one).
import { autoTable } from 'jspdf-autotable';

/**
 * Download labeled records as a table PDF. Header = the first record's keys (column
 * labels); each body row = that record's values. Empty input is a no-op (the button
 * is disabled upstream). `filename` is the base; `.pdf` is appended.
 */
export function downloadPdf(records, filename, { title } = {}) {
  if (!Array.isArray(records) || records.length === 0) return;
  const headers = Object.keys(records[0]);
  const body = records.map((r) => headers.map((h) => r[h]));
  const doc = new jsPDF({ orientation: 'landscape' });
  if (title) doc.text(String(title), 14, 14);
  autoTable(doc, { head: [headers], body, startY: title ? 20 : 14, styles: { fontSize: 8 } });
  doc.save(`${filename}.pdf`);
}
