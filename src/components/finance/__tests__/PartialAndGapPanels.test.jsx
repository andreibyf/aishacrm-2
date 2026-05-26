/**
 * UI-1C partial-live + gap-only panels — render shape + read-only safety.
 *
 * Covers ProjectionStatusPanel, SandboxAdapterPanel, and the six pure
 * gap-only panels (Draft invoices, Journal drafts, Approval queue,
 * Adapter queue, Audit timeline, Evidence placeholder).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProjectionStatusPanel from '../ProjectionStatusPanel';
import SandboxAdapterPanel from '../SandboxAdapterPanel';
import DraftInvoicesPanel from '../DraftInvoicesPanel';
import JournalDraftsPanel from '../JournalDraftsPanel';
import ApprovalQueuePanel from '../ApprovalQueuePanel';
import AdapterQueuePanel from '../AdapterQueuePanel';
import AuditTimelinePanel from '../AuditTimelinePanel';
import EvidencePlaceholder from '../EvidencePlaceholder';

afterEach(() => cleanup());

const HEALTHY = {
  runtime: { persistence: 'in_memory', provider_sync: 'disabled' },
};
const PROJECTION_BACKED = {
  runtime: { persistence: 'postgres-projection', provider_sync: 'disabled' },
};
const PROVIDER_WRITES_ON = {
  runtime: { persistence: 'in_memory', provider_sync: 'enabled' },
};

describe('ProjectionStatusPanel', () => {
  it('renders the persistence value from runtime status', () => {
    render(<ProjectionStatusPanel status={HEALTHY} />);
    const row = screen.getByTestId('finance-projection-status-persistence');
    expect(row).toHaveAttribute('data-persistence', 'in_memory');
    expect(row).toHaveTextContent('in_memory');
  });

  it('shows the degraded note while persistence is in_memory', () => {
    render(<ProjectionStatusPanel status={HEALTHY} />);
    expect(screen.getByTestId('finance-projection-status-degraded-note')).toBeInTheDocument();
    expect(screen.queryByTestId('finance-projection-status-healthy-note')).not.toBeInTheDocument();
  });

  it('shows the healthy note when persistence advances past in_memory', () => {
    render(<ProjectionStatusPanel status={PROJECTION_BACKED} />);
    expect(screen.getByTestId('finance-projection-status-healthy-note')).toBeInTheDocument();
    expect(screen.queryByTestId('finance-projection-status-degraded-note')).not.toBeInTheDocument();
  });

  it('renders the per-projection cursor gap card alongside the live posture', () => {
    render(<ProjectionStatusPanel status={HEALTHY} />);
    expect(screen.getByTestId('finance-gap-card-826')).toBeInTheDocument(); // §8.2.6
  });

  it('exposes no mutating button (no replay / advance-cursor / drop-rebuild)', () => {
    render(<ProjectionStatusPanel status={HEALTHY} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('SandboxAdapterPanel', () => {
  it('renders the provider_sync value from runtime status', () => {
    render(<SandboxAdapterPanel status={HEALTHY} />);
    const row = screen.getByTestId('finance-sandbox-adapter-provider-sync');
    expect(row).toHaveAttribute('data-provider-sync', 'disabled');
    expect(row).toHaveTextContent('disabled');
  });

  it('still renders the registered-adapter gap card when provider_sync flips to enabled', () => {
    render(<SandboxAdapterPanel status={PROVIDER_WRITES_ON} />);
    const row = screen.getByTestId('finance-sandbox-adapter-provider-sync');
    expect(row).toHaveAttribute('data-provider-sync', 'enabled');
    expect(screen.getByTestId('finance-gap-card-827')).toBeInTheDocument(); // §8.2.7
  });

  it('exposes no mutating button (no credentials / test-connection / sync-trigger)', () => {
    render(<SandboxAdapterPanel status={HEALTHY} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('gap-only panels', () => {
  const cases = [
    {
      name: 'DraftInvoicesPanel',
      Component: DraftInvoicesPanel,
      testId: 'finance-draft-invoices-panel',
      designRef: '§8.2.1',
    },
    {
      name: 'JournalDraftsPanel',
      Component: JournalDraftsPanel,
      testId: 'finance-journal-drafts-panel',
      designRef: '§8.2.2',
    },
    {
      name: 'ApprovalQueuePanel',
      Component: ApprovalQueuePanel,
      testId: 'finance-approval-queue-panel',
      designRef: '§8.2.3',
    },
    {
      name: 'AdapterQueuePanel',
      Component: AdapterQueuePanel,
      testId: 'finance-adapter-queue-panel',
      designRef: '§8.2.4',
    },
    {
      name: 'AuditTimelinePanel',
      Component: AuditTimelinePanel,
      testId: 'finance-audit-timeline-panel',
      designRef: '§8.2.5',
    },
    {
      name: 'EvidencePlaceholder',
      Component: EvidencePlaceholder,
      testId: 'finance-evidence-placeholder',
      designRef: '§8.2.8',
    },
  ];

  for (const { name, Component, testId, designRef } of cases) {
    it(`${name} renders the matching gap card with the §8.2.x designRef`, () => {
      render(<Component />);
      const wrapper = screen.getByTestId(testId);
      expect(wrapper).toBeInTheDocument();
      // The inner GapStateCard carries the design-ref attribute.
      const card = wrapper.querySelector('[data-design-ref]');
      expect(card).not.toBeNull();
      expect(card.getAttribute('data-design-ref')).toBe(designRef);
    });

    it(`${name} exposes no button — pure read-only gap state`, () => {
      render(<Component />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  }
});
