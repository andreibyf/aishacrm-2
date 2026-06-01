/**
 * Finance Read API Slice 1 — live read panels.
 *
 * Covers the panels rewired from gap cards to live reads: DraftInvoices,
 * JournalDrafts, ApprovalQueue, AdapterQueue, AuditTimeline, SandboxAdapter,
 * Evidence. Asserts data / empty / error states and read-only safety (only
 * Refresh / Load more controls; no mutating affordance).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('@/api/finance', () => ({
  getDraftInvoices: vi.fn(),
  getJournalDrafts: vi.fn(),
  getApprovals: vi.fn(),
  getAdapterJobs: vi.fn(),
  getAuditEvents: vi.fn(),
  getAdapters: vi.fn(),
  getEvidencePack: vi.fn(),
}));

import * as finance from '@/api/finance';
import DraftInvoicesPanel from '../DraftInvoicesPanel';
import JournalDraftsPanel from '../JournalDraftsPanel';
import ApprovalQueuePanel from '../ApprovalQueuePanel';
import AdapterQueuePanel from '../AdapterQueuePanel';
import AuditTimelinePanel from '../AuditTimelinePanel';
import SandboxAdapterPanel from '../SandboxAdapterPanel';
import EvidencePlaceholder from '../EvidencePlaceholder';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => {
  for (const fn of Object.values(finance)) fn.mockReset?.();
});
afterEach(() => cleanup());

// A button is "read-only-safe" if its accessible name carries no mutating verb
// (approve / reject / reverse / replay / retry / cancel / sync / generate /
// create / delete / post / send / save / enable / disable / activate). Refresh,
// Load more, Rebuild (a pure re-read), and Export CSV (a read-only recordkeeping
// serialization of already-displayed data — authorized by the Beta Exports
// packet) are allowed.
const MUTATING_LABEL =
  /(approve|reject|reverse|replay|retry|cancel|sync|generate|create|delete|remove|post|send|submit|save|enable|disable|activate|deactivate|trigger)/i;
function assertOnlyReadOnlyButtons() {
  for (const btn of screen.queryAllByRole('button')) {
    const label = btn.getAttribute('aria-label') || btn.textContent || '';
    expect(label).not.toMatch(MUTATING_LABEL);
  }
}

describe('DraftInvoicesPanel (live §6.1)', () => {
  it('renders fetched rows', async () => {
    finance.getDraftInvoices.mockResolvedValue({
      invoices: [
        {
          id: 'invoice_1',
          status: 'draft',
          customer_id: 'CUST-1',
          customer_name: null,
          currency: 'usd',
          amount_cents: 1000,
          created_at: 'now',
          updated_at: 'now',
        },
      ],
      total: 1,
    });
    render(<DraftInvoicesPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-draft-invoices-table')).toBeInTheDocument(),
    );
    expect(screen.getByText('invoice_1')).toBeInTheDocument();
    assertOnlyReadOnlyButtons();
  });

  it('renders the empty state', async () => {
    finance.getDraftInvoices.mockResolvedValue({ invoices: [], total: 0 });
    render(<DraftInvoicesPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-draft-invoices-empty')).toBeInTheDocument(),
    );
  });

  it('renders the error state', async () => {
    finance.getDraftInvoices.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    render(<DraftInvoicesPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-draft-invoices-error')).toBeInTheDocument(),
    );
  });
});

describe('JournalDraftsPanel (live §6.2)', () => {
  it('renders rows + read-only', async () => {
    finance.getJournalDrafts.mockResolvedValue({
      journal_drafts: [{ id: 'journal_1', aggregate_id: 'journal_1', status: 'draft' }],
      total: 1,
    });
    render(<JournalDraftsPanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-journal-drafts-row-journal_1')).toBeInTheDocument(),
    );
    assertOnlyReadOnlyButtons();
  });
});

describe('ApprovalQueuePanel (live §6.3)', () => {
  it('renders pending approvals and exposes no approve/reject button', async () => {
    finance.getApprovals.mockResolvedValue({
      approvals: [{ id: 'approval_1', status: 'pending', subject_type: 'journal_entry' }],
      total: 1,
    });
    render(<ApprovalQueuePanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByText('approval_1')).toBeInTheDocument());
    assertOnlyReadOnlyButtons();
    // Defaults to pending.
    expect(finance.getApprovals).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ status: 'pending' }),
    );
  });
});

describe('AdapterQueuePanel (live §6.4)', () => {
  it('renders adapter jobs and exposes no retry/cancel button', async () => {
    finance.getAdapterJobs.mockResolvedValue({
      adapter_jobs: [{ id: 'adapter_job_1', operation: 'push_draft', status: 'draft' }],
      total: 1,
    });
    render(<AdapterQueuePanel tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByText('adapter_job_1')).toBeInTheDocument());
    assertOnlyReadOnlyButtons();
  });
});

describe('AuditTimelinePanel (live §6.5)', () => {
  it('renders events and a Load more control when next_cursor is present', async () => {
    finance.getAuditEvents.mockResolvedValue({
      events: [{ id: 'evt_1', event_type: 'finance.invoice.draft_created', occurred_at: 'now' }],
      next_cursor: 'CURSOR',
    });
    render(<AuditTimelinePanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-audit-timeline-table')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('finance-audit-timeline-load-more')).toBeInTheDocument();
    assertOnlyReadOnlyButtons();
  });

  it('hides Load more when next_cursor is null', async () => {
    finance.getAuditEvents.mockResolvedValue({
      events: [{ id: 'evt_1', event_type: 'finance.invoice.draft_created', occurred_at: 'now' }],
      next_cursor: null,
    });
    render(<AuditTimelinePanel tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-audit-timeline-table')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('finance-audit-timeline-load-more')).not.toBeInTheDocument();
  });
});

describe('SandboxAdapterPanel (live §6.7 metadata registry)', () => {
  it('renders adapter metadata with provider writes disabled and no gap card', async () => {
    finance.getAdapters.mockResolvedValue({
      adapters: [
        {
          name: 'erpnext_sandbox',
          kind: 'sandbox',
          mode: 'draft_only',
          capabilities: ['push_draft', 'sync_status', 'reconcile'],
          unsupported: ['push_final'],
          provider_writes_enabled: false,
          base_url_guarded_to: 'sandbox',
          status: 'registered',
          production_allowed: false,
          config_summary: { tier: 'sandbox', credentials_resolved: false },
        },
      ],
    });
    render(
      <SandboxAdapterPanel status={{ runtime: { provider_sync: 'disabled' } }} tenantId={TENANT} />,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('finance-sandbox-adapter-item-erpnext_sandbox'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('finance-sandbox-adapter-writes-erpnext_sandbox')).toHaveTextContent(
      'disabled',
    );
    // The gap card is gone now that /adapters is implemented.
    expect(screen.queryByTestId('finance-gap-card-827')).not.toBeInTheDocument();
    assertOnlyReadOnlyButtons();
  });
});

describe('EvidencePlaceholder (live §6.8 on-demand build)', () => {
  it('renders the built pack metadata + integrity, no generate/download button', async () => {
    finance.getEvidencePack.mockResolvedValue({
      pack: {
        pack_id: 'pack_abc',
        generated_at: 'now',
        artifact_count: 3,
        integrity: { pack_hash: 'h1', events_hash: 'h2', approvals_hash: 'h3' },
      },
    });
    render(<EvidencePlaceholder tenantId={TENANT} />);
    await waitFor(() => expect(screen.getByTestId('finance-evidence-pack')).toBeInTheDocument());
    expect(screen.getByTestId('finance-evidence-pack-id')).toHaveTextContent('pack_abc');
    expect(screen.getByTestId('finance-evidence-artifact-count')).toHaveTextContent('3');
    assertOnlyReadOnlyButtons();
  });
});
