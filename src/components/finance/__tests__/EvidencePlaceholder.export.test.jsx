/**
 * EvidencePlaceholder CSV export (Beta Exports slice).
 *
 * Exports the displayed pack metadata + integrity hashes. Secret-safety: no
 * credential / token / secret fields may appear in the export.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockFinance = { getEvidencePack: vi.fn() };
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return { ...actual, getEvidencePack: (...a) => mockFinance.getEvidencePack(...a) };
});

import * as csv from '../financeCsv';
import EvidencePlaceholder from '../EvidencePlaceholder';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => mockFinance.getEvidencePack.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EvidencePlaceholder — CSV export', () => {
  it('exports pack metadata + hashes and contains no secret fields', async () => {
    mockFinance.getEvidencePack.mockResolvedValue({
      pack: {
        pack_id: 'pack_abc',
        generated_at: 'now',
        artifact_count: 3,
        integrity: { pack_hash: 'h1', events_hash: 'h2', approvals_hash: 'h3' },
      },
    });
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
    render(<EvidencePlaceholder tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-export-evidence-pack')).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId('finance-export-evidence-pack'));

    const records = spy.mock.calls[0][0];
    const flat = JSON.stringify(records);
    expect(flat).toMatch(/pack_abc/);
    expect(flat).toMatch(/h1/); // pack hash present
    expect(flat).not.toMatch(/secret|credential|token|api[_-]?key|password/i);
  });

  it('disables export when no pack is built', async () => {
    mockFinance.getEvidencePack.mockResolvedValue({ pack: null });
    render(<EvidencePlaceholder tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-evidence-loading')).toBeInTheDocument());
    expect(screen.getByTestId('finance-export-evidence-pack')).toBeDisabled();
  });
});
