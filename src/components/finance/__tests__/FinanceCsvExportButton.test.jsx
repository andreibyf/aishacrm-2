import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FinanceCsvExportButton from '../FinanceCsvExportButton';
import * as csv from '../financeCsv';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FinanceCsvExportButton', () => {
  it('enabled with records; click triggers download with area+tenant filename', () => {
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
    render(
      <FinanceCsvExportButton
        records={[{ ID: 'a' }]}
        area="draft-invoices"
        tenantId="00000000-x"
      />,
    );
    const btn = screen.getByTestId('finance-export-draft-invoices');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toEqual([{ ID: 'a' }]);
    expect(spy.mock.calls[0][1]).toMatch(/^finance-draft-invoices_00000000_/);
  });

  it('disabled with explanatory title when no records', () => {
    render(<FinanceCsvExportButton records={[]} area="draft-invoices" tenantId="t" />);
    const btn = screen.getByTestId('finance-export-draft-invoices');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toMatch(/nothing to export/i);
  });
});
