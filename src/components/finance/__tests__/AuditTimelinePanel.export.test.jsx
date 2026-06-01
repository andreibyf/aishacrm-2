import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const mockFinance = { getAuditEvents: vi.fn() };
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return { ...actual, getAuditEvents: (...a) => mockFinance.getAuditEvents(...a) };
});

import AuditTimelinePanel from '../AuditTimelinePanel';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => mockFinance.getAuditEvents.mockReset());
afterEach(() => cleanup());

describe('AuditTimelinePanel — CSV export', () => {
  it('shows an enabled export button when events load', async () => {
    mockFinance.getAuditEvents.mockResolvedValue({
      events: [{ id: 'evt_1', event_type: 'finance.invoice.draft_created', occurred_at: 'now' }],
      next_cursor: null,
    });
    render(<AuditTimelinePanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-export-audit-events')).not.toBeDisabled(),
    );
  });

  it('disables export when there are no events', async () => {
    mockFinance.getAuditEvents.mockResolvedValue({ events: [], next_cursor: null });
    render(<AuditTimelinePanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-export-audit-events')).toBeDisabled());
  });
});
