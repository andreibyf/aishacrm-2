/**
 * GapStateCard (UI-1C) — shared gap-state surface.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import GapStateCard from '../GapStateCard';
import { FINANCE_API_GAPS } from '@/api/finance';

afterEach(() => cleanup());

describe('GapStateCard', () => {
  // projectionCursors (§8.2.6) is the remaining gap after Read API Slice 1
  // implemented the other read endpoints.
  it('renders the descriptor fields verbatim with stable testid', () => {
    render(<GapStateCard title="Projection cursors" gap={FINANCE_API_GAPS.projectionCursors} />);
    const card = screen.getByTestId('finance-gap-card-826');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('data-design-ref', '§8.2.6');
    expect(card).toHaveAttribute('data-endpoint', 'GET /api/v2/finance/projection/cursors');
    expect(card).toHaveTextContent('Projection cursors');
    expect(card).toHaveTextContent('GET /api/v2/finance/projection/cursors');
    expect(card).toHaveTextContent(FINANCE_API_GAPS.projectionCursors.naturalBackingSource);
  });

  it('frames the state as "Read-API not yet implemented", not an error', () => {
    render(<GapStateCard title="Projection cursors" gap={FINANCE_API_GAPS.projectionCursors} />);
    expect(screen.getByText(/Read-API not yet implemented/i)).toBeInTheDocument();
  });

  it('exposes no button — read-only surface', () => {
    render(<GapStateCard title="Projection cursors" gap={FINANCE_API_GAPS.projectionCursors} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
