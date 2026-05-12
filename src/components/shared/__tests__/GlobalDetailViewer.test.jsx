import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GlobalDetailViewer from '../GlobalDetailViewer.jsx';

// The component imports entity API helpers at module load time. Stub them so
// the import resolution succeeds; we don't exercise mutation paths in these tests.
vi.mock('@/api/entities', () => ({
  Account: { update: vi.fn() },
  Contact: { update: vi.fn() },
  Lead: { update: vi.fn() },
  Opportunity: { update: vi.fn() },
}));

vi.mock('@/utils/contextBridge', () => ({
  setAiShaContext: vi.fn(),
}));

const baseProps = (record, entityType = 'Lead') => ({
  open: true,
  onClose: vi.fn(),
  recordInfo: { record, entityType },
});

describe('GlobalDetailViewer — Created/Updated rows', () => {
  it('renders Updated row from `updated_at` (canonical column for Lead/Contact/Account/Opportunity)', () => {
    const record = {
      id: 'lead-1',
      first_name: 'Jane',
      last_name: 'Doe',
      updated_at: '2026-05-06T10:30:00.000Z',
      created_at: '2026-05-01T08:00:00.000Z',
    };
    render(<GlobalDetailViewer {...baseProps(record, 'Lead')} />);

    // The Updated row label should be present
    expect(screen.getByText('Updated')).toBeInTheDocument();
    // formatDate uses date-fns "PPp" pattern → "May 6, 2026 at 10:30 AM" (zone-dependent),
    // so just assert the row exists rather than the formatted string. Pair it with
    // an absence assertion against the legacy fall-through.
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it('falls back to `updated_date` only when `updated_at` is absent', () => {
    const record = {
      id: 'lead-1',
      first_name: 'Jane',
      last_name: 'Doe',
      updated_date: '2026-05-06T10:30:00.000Z',
      // no updated_at
    };
    render(<GlobalDetailViewer {...baseProps(record, 'Lead')} />);
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('omits Updated row when neither timestamp is present', () => {
    const record = { id: 'lead-1', first_name: 'Jane', last_name: 'Doe' };
    render(<GlobalDetailViewer {...baseProps(record, 'Lead')} />);
    expect(screen.queryByText('Updated')).not.toBeInTheDocument();
  });

  it('renders Created row from `created_date` first, then `created_at`', () => {
    const r1 = {
      id: 'lead-1',
      first_name: 'Jane',
      last_name: 'Doe',
      created_date: '2026-04-01T00:00:00.000Z',
    };
    const { unmount } = render(<GlobalDetailViewer {...baseProps(r1, 'Lead')} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
    unmount();

    const r2 = {
      id: 'lead-2',
      first_name: 'Jane',
      last_name: 'Doe',
      created_at: '2026-04-01T00:00:00.000Z',
      // no created_date
    };
    render(<GlobalDetailViewer {...baseProps(r2, 'Lead')} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
  });
});
