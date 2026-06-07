import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import FinancePdfExportButton from '../FinancePdfExportButton';
import * as pdf from '../financePdf';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FinancePdfExportButton', () => {
  it('enables with records and triggers a PDF download with the area+tenant filename', () => {
    const spy = vi.spyOn(pdf, 'downloadPdf').mockImplementation(() => {});
    render(
      <FinancePdfExportButton
        records={[{ Code: '1000' }]}
        area="chart-of-accounts"
        tenantId="00000000-0000-4000-8000-000000000011"
        title="Chart of accounts"
      />,
    );
    const button = screen.getByTestId('finance-pdf-chart-of-accounts');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1]).toMatch(/^finance-chart-of-accounts_00000000_/);
    expect(spy.mock.calls[0][2]).toEqual({ title: 'Chart of accounts' });
  });

  it('disables with an explanatory title when there are no records', () => {
    render(
      <FinancePdfExportButton
        records={[]}
        area="chart-of-accounts"
        tenantId="00000000-0000-4000-8000-000000000011"
      />,
    );
    const button = screen.getByTestId('finance-pdf-chart-of-accounts');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/nothing to export/i));
  });
});
