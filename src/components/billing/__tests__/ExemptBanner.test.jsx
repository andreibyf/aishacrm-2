/**
 * ExemptBanner component tests.
 *
 * Covers: title + body rendering, optional reason + setAt,
 * test id presence, status role.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExemptBanner from '../ExemptBanner';

describe('ExemptBanner', () => {
  it('renders the title and default body copy', () => {
    render(<ExemptBanner />);
    expect(screen.getByText(/billing is waived/i)).toBeInTheDocument();
    expect(screen.getByText(/billing-exempt/i)).toBeInTheDocument();
  });

  it('renders the reason line when reason is provided', () => {
    render(<ExemptBanner reason="Enterprise pilot agreement" />);
    expect(screen.getByText(/Reason:/i)).toBeInTheDocument();
    expect(screen.getByText(/Enterprise pilot agreement/)).toBeInTheDocument();
  });

  it('omits the reason line when reason is missing', () => {
    render(<ExemptBanner />);
    expect(screen.queryByText(/^Reason:/i)).not.toBeInTheDocument();
  });

  it('renders the applied-date line when setAt is provided', () => {
    render(<ExemptBanner setAt="2026-04-10T12:00:00Z" />);
    expect(screen.getByText(/Applied/)).toBeInTheDocument();
  });

  it('exposes role="status" and data-testid for page-level assertions', () => {
    render(<ExemptBanner />);
    const banner = screen.getByTestId('exempt-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'status');
  });
});
