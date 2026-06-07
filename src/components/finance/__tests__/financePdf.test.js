import { describe, it, expect, vi, afterEach } from 'vitest';

const { save, text, autoTable } = vi.hoisted(() => ({
  save: vi.fn(),
  text: vi.fn(),
  autoTable: vi.fn(),
}));
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return { save, text };
  }),
}));
vi.mock('jspdf-autotable', () => ({ default: autoTable }));

import { downloadPdf } from '../financePdf';

afterEach(() => vi.clearAllMocks());

describe('financePdf.downloadPdf', () => {
  it('renders records as a table (label header + displayed cells) and saves <filename>.pdf', () => {
    downloadPdf(
      [
        { Code: '1000', Name: 'Cash' },
        { Code: '1050', Name: 'Bank' },
      ],
      'finance-chart-of-accounts_00000000_2026-06-07',
      { title: 'Chart of accounts' },
    );
    expect(autoTable).toHaveBeenCalledOnce();
    const opts = autoTable.mock.calls[0][1];
    expect(opts.head).toEqual([['Code', 'Name']]);
    expect(opts.body).toEqual([
      ['1000', 'Cash'],
      ['1050', 'Bank'],
    ]);
    expect(save).toHaveBeenCalledWith('finance-chart-of-accounts_00000000_2026-06-07.pdf');
  });

  it('is a no-op for empty/invalid records', () => {
    downloadPdf([], 'x');
    downloadPdf(null, 'x');
    expect(autoTable).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
