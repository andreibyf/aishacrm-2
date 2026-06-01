import { describe, it, expect } from 'vitest';
import {
  columnsToRecords,
  recordsToCsv,
  financeExportFilename,
  EMPTY_DISPLAY,
} from '../financeCsv';

describe('columnsToRecords', () => {
  it('uses column labels as keys and render() for values', () => {
    const columns = [
      { key: 'id', label: 'ID' },
      {
        key: 'amount_cents',
        label: 'Amount',
        render: (r) => `$${(r.amount_cents / 100).toFixed(2)}`,
      },
    ];
    const rows = [{ id: 'a1', amount_cents: 120000 }];
    expect(columnsToRecords(columns, rows)).toEqual([{ ID: 'a1', Amount: '$1200.00' }]);
  });

  it('renders empty/null/undefined cells as the UI placeholder, matching the table (—)', () => {
    // The live tables show '—' for these (FinanceTablePanel/AuditTimelinePanel);
    // the export must serialize the same glyph so CSV == on-screen.
    const columns = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
      { key: 'd', label: 'D' },
    ];
    const rows = [{ a: null, b: undefined, c: '', d: 0 }];
    expect(columnsToRecords(columns, rows)).toEqual([
      { A: EMPTY_DISPLAY, B: EMPTY_DISPLAY, C: EMPTY_DISPLAY, D: '0' },
    ]);
  });

  it('returns [] for empty/non-array rows', () => {
    expect(columnsToRecords([{ key: 'id', label: 'ID' }], [])).toEqual([]);
    expect(columnsToRecords([{ key: 'id', label: 'ID' }], null)).toEqual([]);
  });
});

describe('recordsToCsv', () => {
  it('emits header from keys and quotes fields with commas/quotes/newlines', () => {
    const csv = recordsToCsv([
      { A: 'x', B: 'has, comma' },
      { A: 'q"q', B: 'line\nbreak' },
    ]);
    expect(csv).toBe('A,B\nx,"has, comma"\n"q""q","line\nbreak"');
  });

  it('returns empty string for no records', () => {
    expect(recordsToCsv([])).toBe('');
  });
});

describe('financeExportFilename', () => {
  it('builds <area>_<tenantShort>_<date> with no secrets', () => {
    const d = new Date('2026-05-31T12:00:00Z');
    expect(financeExportFilename('draft-invoices', '00000000-0000-4000-8000-000000000011', d)).toBe(
      'finance-draft-invoices_00000000_2026-05-31',
    );
  });
});
