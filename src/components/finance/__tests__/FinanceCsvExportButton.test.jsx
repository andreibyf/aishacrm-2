import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import FinanceCsvExportButton from '../FinanceCsvExportButton';
import * as csv from '../financeCsv';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FinanceCsvExportButton', () => {
  it('enables with records and triggers a download using the finance filename', () => {
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});

    render(
      <FinanceCsvExportButton
        records={[{ ID: 'a' }]}
        area="draft-invoices"
        tenantId="00000000-0000-4000-8000-000000000011"
      />,
    );

    const button = screen.getByTestId('finance-export-draft-invoices');
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1]).toMatch(/^finance-draft-invoices_00000000_/);
  });

  it('disables with an explanatory title when there are no records', () => {
    render(
      <FinanceCsvExportButton
        records={[]}
        area="draft-invoices"
        tenantId="00000000-0000-4000-8000-000000000011"
      />,
    );

    const button = screen.getByTestId('finance-export-draft-invoices');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/nothing to export/i));
  });
});
