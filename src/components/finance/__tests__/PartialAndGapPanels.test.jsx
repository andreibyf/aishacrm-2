/**
 * Deferred panel — render shape + read-only safety.
 *
 * After Finance Read API Slice 1, only ProjectionStatusPanel remains a
 * partial-live / gap panel (projection cursors still depend on the persistent
 * projection store). The previously gap-only panels are now live and covered
 * by LiveDataPanels.test.jsx.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProjectionStatusPanel from '../ProjectionStatusPanel';

afterEach(() => cleanup());

const HEALTHY = {
  runtime: { persistence: 'in_memory', provider_sync: 'disabled' },
};
const PROJECTION_BACKED = {
  runtime: { persistence: 'postgres-projection', provider_sync: 'disabled' },
};

describe('ProjectionStatusPanel (still deferred — §8.2.6 gap)', () => {
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
