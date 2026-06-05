/**
 * RuntimeOverview (UI-1B) — posture rendering, counts, refresh control,
 * error surface, read-only safety.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RuntimeOverview from '../RuntimeOverview';

const HEALTHY = {
  tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
  runtime: {
    mode: 'mock_read_only',
    persistence: 'in_memory',
    provider_sync: 'disabled',
    governance: 'enabled',
  },
  counts: {
    journal_entries: 3,
    invoices: 1,
    approvals: 2,
    audit_events: 10,
    adapter_jobs: 0,
  },
};

afterEach(() => {
  cleanup();
});

describe('RuntimeOverview — posture rendering', () => {
  it('renders tenant id, runtime fields, and all five count tiles from a healthy payload', () => {
    render(<RuntimeOverview status={HEALTHY} loading={false} error={null} />);

    const tenantRow = screen.getByTestId('runtime-overview-row-tenant');
    expect(tenantRow).toHaveTextContent('a11dfb63-4b18-4eb8-872e-747af2e37c46');

    expect(screen.getByTestId('runtime-overview-row-mode')).toHaveTextContent('mock_read_only');
    expect(screen.getByTestId('runtime-overview-row-persistence')).toHaveTextContent('in_memory');
    expect(screen.getByTestId('runtime-overview-row-provider-sync')).toHaveTextContent('disabled');
    expect(screen.getByTestId('runtime-overview-row-governance')).toHaveTextContent('enabled');

    expect(screen.getByTestId('runtime-overview-count-journal-entries')).toHaveTextContent('3');
    expect(screen.getByTestId('runtime-overview-count-invoices')).toHaveTextContent('1');
    expect(screen.getByTestId('runtime-overview-count-approvals')).toHaveTextContent('2');
    expect(screen.getByTestId('runtime-overview-count-audit-events')).toHaveTextContent('10');
    expect(screen.getByTestId('runtime-overview-count-adapter-jobs')).toHaveTextContent('0');
  });

  it('annotates the mode row when the value is the mock_read_only placeholder (§8.2.9)', () => {
    render(<RuntimeOverview status={HEALTHY} loading={false} />);
    const note = screen.getByTestId('runtime-overview-mode-placeholder-note');
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute('data-design-ref', '§8.2.9');
    expect(note).toHaveTextContent(/placeholder/i);
  });

  it('hides the mode placeholder note once mode is no longer mock_read_only', () => {
    render(
      <RuntimeOverview
        status={{ ...HEALTHY, runtime: { ...HEALTHY.runtime, mode: 'persistent' } }}
        loading={false}
      />,
    );
    expect(screen.queryByTestId('runtime-overview-mode-placeholder-note')).not.toBeInTheDocument();
  });

  it('renders all-zero counts when status payload counts are all 0', () => {
    const empty = {
      ...HEALTHY,
      counts: {
        journal_entries: 0,
        invoices: 0,
        approvals: 0,
        audit_events: 0,
        adapter_jobs: 0,
      },
    };
    render(<RuntimeOverview status={empty} />);
    expect(screen.getByTestId('runtime-overview-count-journal-entries')).toHaveTextContent('0');
    expect(screen.getByTestId('runtime-overview-count-adapter-jobs')).toHaveTextContent('0');
  });

  it('shows "Loading…" tenant placeholder when status is null and loading', () => {
    render(<RuntimeOverview status={null} loading={true} />);
    expect(screen.getByTestId('runtime-overview-row-tenant')).toHaveTextContent('Loading…');
  });

  it('shows an em-dash for missing posture fields without a status', () => {
    render(<RuntimeOverview status={null} loading={false} />);
    // Mode / persistence / provider-sync / governance rows render the em-dash
    // span instead of the value string when no status is present.
    expect(screen.getByTestId('runtime-overview-row-mode')).toHaveTextContent('—');
    expect(screen.getByTestId('runtime-overview-row-persistence')).toHaveTextContent('—');
  });
});

describe('RuntimeOverview — refresh control', () => {
  it('invokes onRefresh when the refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<RuntimeOverview status={HEALTHY} onRefresh={onRefresh} loading={false} />);
    fireEvent.click(screen.getByTestId('finance-runtime-overview-refresh'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('disables the refresh button while loading', () => {
    const onRefresh = vi.fn();
    render(<RuntimeOverview status={HEALTHY} onRefresh={onRefresh} loading={true} />);
    const btn = screen.getByTestId('finance-runtime-overview-refresh');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('renders the last-refreshed timestamp when provided', () => {
    const onRefresh = vi.fn();
    const stamp = new Date('2026-05-26T18:00:00.000Z');
    render(
      <RuntimeOverview
        status={HEALTHY}
        loading={false}
        onRefresh={onRefresh}
        lastRefreshedAt={stamp}
      />,
    );
    expect(screen.getByTestId('finance-runtime-overview-last-refreshed')).toHaveTextContent(
      /Last refreshed at/,
    );
  });
});

describe('RuntimeOverview — error surface', () => {
  it('renders the inline error block when error is non-null and preserves the posture grid', () => {
    render(
      <RuntimeOverview
        status={null}
        loading={false}
        error={{ status: 500, message: 'Unexpected finance route error' }}
      />,
    );
    const errBox = screen.getByTestId('finance-runtime-overview-error');
    expect(errBox).toHaveTextContent('Could not load runtime status');
    expect(errBox).toHaveTextContent('Unexpected finance route error');
    expect(errBox).toHaveTextContent('500');
    // The card still renders so the user can hit refresh.
    expect(screen.getByTestId('finance-runtime-overview-refresh')).toBeInTheDocument();
  });
});

describe('RuntimeOverview — read-only safety', () => {
  it('contains no mutating-style buttons (only Refresh)', () => {
    render(<RuntimeOverview status={HEALTHY} loading={false} />);
    const buttons = screen.getAllByRole('button');
    const mutatingPattern =
      /approve|reject|reverse|replay|retry|cancel|trigger|enable|disable|activate|production|sync now/i;
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') || btn.textContent || '';
      expect(label).not.toMatch(mutatingPattern);
    }
    // And the only allowed button is Refresh
    const labels = buttons.map((b) => (b.textContent || '').trim().toLowerCase());
    expect(labels).toContain('refresh');
  });
});

describe('RuntimeOverview — Test/Live data mode control (superadmin)', () => {
  const base = (mode) => ({ ...HEALTHY, runtime: { ...HEALTHY.runtime, mode, data_mode: mode } });

  it('does not render the mode toggle without canEditMode/onChangeMode', () => {
    render(<RuntimeOverview status={base('test')} />);
    expect(screen.queryByTestId('runtime-overview-mode-toggle')).toBeNull();
  });

  it('renders the toggle for a superadmin and marks the active mode', () => {
    render(
      <RuntimeOverview status={base('test')} dataMode="test" canEditMode onChangeMode={() => {}} />,
    );
    expect(screen.getByTestId('runtime-overview-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-overview-mode-set-test')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('runtime-overview-mode-set-live')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('fires onChangeMode with the clicked mode', () => {
    const onChangeMode = vi.fn();
    render(
      <RuntimeOverview
        status={base('test')}
        dataMode="test"
        canEditMode
        onChangeMode={onChangeMode}
      />,
    );
    fireEvent.click(screen.getByTestId('runtime-overview-mode-set-live'));
    expect(onChangeMode).toHaveBeenCalledWith('live');
  });

  it('disables controls while a change is in flight and surfaces an error', () => {
    render(
      <RuntimeOverview
        status={base('test')}
        dataMode="test"
        canEditMode
        onChangeMode={() => {}}
        modeUpdating
        modeError="boom"
      />,
    );
    expect(screen.getByTestId('runtime-overview-mode-set-live')).toBeDisabled();
    expect(screen.getByTestId('runtime-overview-mode-error')).toHaveTextContent('boom');
  });
});

describe('RuntimeOverview — dormant test-data indicator + switch confirm (slice 6d)', () => {
  const base = (mode) => ({ ...HEALTHY, runtime: { ...HEALTHY.runtime, mode, data_mode: mode } });

  it('does not render the dormant indicator when testDataCount is 0', () => {
    render(<RuntimeOverview status={base('live')} testDataCount={0} />);
    expect(screen.queryByTestId('runtime-overview-dormant-test')).toBeNull();
  });

  it('renders the dormant indicator when testDataCount > 0 (even in live mode)', () => {
    render(<RuntimeOverview status={base('live')} testDataCount={5} />);
    const dormant = screen.getByTestId('runtime-overview-dormant-test');
    expect(dormant).toBeInTheDocument();
    expect(dormant).toHaveTextContent(/5/);
    expect(dormant).toHaveTextContent(/test record/i);
  });

  it('with dormant test data, clicking the target mode shows a confirm and does NOT call onChangeMode', () => {
    const onChangeMode = vi.fn();
    render(
      <RuntimeOverview
        status={base('test')}
        dataMode="test"
        canEditMode
        onChangeMode={onChangeMode}
        testDataCount={3}
      />,
    );
    fireEvent.click(screen.getByTestId('runtime-overview-mode-set-live'));
    expect(onChangeMode).not.toHaveBeenCalled();
    const confirm = screen.getByTestId('runtime-overview-switch-confirm');
    expect(confirm).toBeInTheDocument();
    expect(confirm).toHaveTextContent(/3/);
    expect(confirm).toHaveTextContent(/keeps them/i);
  });

  it('confirming the switch calls onChangeMode with the target mode', () => {
    const onChangeMode = vi.fn();
    render(
      <RuntimeOverview
        status={base('test')}
        dataMode="test"
        canEditMode
        onChangeMode={onChangeMode}
        testDataCount={3}
      />,
    );
    fireEvent.click(screen.getByTestId('runtime-overview-mode-set-live'));
    fireEvent.click(screen.getByTestId('runtime-overview-switch-confirm-yes'));
    expect(onChangeMode).toHaveBeenCalledWith('live');
  });

  it('cancelling the switch dismisses the confirm without calling onChangeMode', () => {
    const onChangeMode = vi.fn();
    render(
      <RuntimeOverview
        status={base('test')}
        dataMode="test"
        canEditMode
        onChangeMode={onChangeMode}
        testDataCount={3}
      />,
    );
    fireEvent.click(screen.getByTestId('runtime-overview-mode-set-live'));
    fireEvent.click(screen.getByTestId('runtime-overview-switch-confirm-cancel'));
    expect(onChangeMode).not.toHaveBeenCalled();
    expect(screen.queryByTestId('runtime-overview-switch-confirm')).toBeNull();
  });

  it('with testDataCount === 0, clicking the target mode switches immediately (no confirm)', () => {
    const onChangeMode = vi.fn();
    render(
      <RuntimeOverview
        status={base('test')}
        dataMode="test"
        canEditMode
        onChangeMode={onChangeMode}
        testDataCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId('runtime-overview-mode-set-live'));
    expect(onChangeMode).toHaveBeenCalledWith('live');
    expect(screen.queryByTestId('runtime-overview-switch-confirm')).toBeNull();
  });
});
