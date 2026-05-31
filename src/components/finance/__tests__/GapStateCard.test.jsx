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

  // Codex P3: lead with plain-language operator copy; keep endpoint/backing
  // refs available for engineering traceability (demoted, not removed).
  // After Read API Slice 1, projectionCursors is the surviving panel-surfaced
  // gap that carries operatorSummary (runtimeMode is a runtime-overview
  // annotation, not a GapStateCard tab).
  it('leads with the plain-language operator summary', () => {
    render(<GapStateCard title="Projection cursors" gap={FINANCE_API_GAPS.projectionCursors} />);
    const summary = screen.getByTestId('finance-gap-card-operator-summary');
    expect(summary).toHaveTextContent(
      'Detailed projection status (cursors and lag) is not available in this preview yet.',
    );
    // Operator copy must not lead with engineering jargon / file paths.
    expect(summary).not.toHaveTextContent('src/api/finance.js');
    expect(summary.textContent).not.toMatch(/§\d/);
  });

  it('keeps the missing-endpoint + backing-source traceability under technical details', () => {
    render(<GapStateCard title="Projection cursors" gap={FINANCE_API_GAPS.projectionCursors} />);
    const tech = screen.getByTestId('finance-gap-card-technical');
    expect(tech).toHaveTextContent('GET /api/v2/finance/projection/cursors');
    expect(tech).toHaveTextContent(FINANCE_API_GAPS.projectionCursors.naturalBackingSource);
  });

  it('every gap surfaced via a panel carries a plain-language operatorSummary', () => {
    // Only projectionCursors remains surfaced via a GapStateCard panel after
    // the Read API slice implemented the other seven endpoints.
    const gapKeys = ['projectionCursors'];
    for (const key of gapKeys) {
      const gap = FINANCE_API_GAPS[key];
      expect(typeof gap.operatorSummary, `${key} needs operatorSummary`).toBe('string');
      expect(gap.operatorSummary.length).toBeGreaterThan(20);
      // No file paths / design-ref jargon in the operator-facing copy.
      expect(gap.operatorSummary, `${key} operatorSummary must avoid file paths`).not.toMatch(
        /\.js\b|§\d|projection-contracts/,
      );
    }
  });
});
