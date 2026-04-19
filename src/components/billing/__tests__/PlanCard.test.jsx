/**
 * PlanCard component tests.
 *
 * Covers: price/interval rendering, feature list, current-plan badge,
 * select-button visibility, disabled state, onSelect callback.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanCard from '../PlanCard';

const STARTER = {
  code: 'starter_monthly',
  name: 'Starter',
  description: '200 seats, standard support',
  interval: 'month',
  currency: 'USD',
  amount_cents: 4900,
  features: ['200 user seats', 'Standard support', 'Email + WhatsApp'],
};

describe('PlanCard', () => {
  it('renders name, formatted price, interval, and description', () => {
    render(<PlanCard plan={STARTER} />);
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('$49.00')).toBeInTheDocument();
    expect(screen.getByText('/ month')).toBeInTheDocument();
    expect(screen.getByText('200 seats, standard support')).toBeInTheDocument();
  });

  it('renders every feature as a bullet', () => {
    render(<PlanCard plan={STARTER} />);
    STARTER.features.forEach((f) => {
      expect(screen.getByText(f)).toBeInTheDocument();
    });
  });

  it('hides features when compact=true', () => {
    render(<PlanCard plan={STARTER} compact />);
    expect(screen.queryByText('200 user seats')).not.toBeInTheDocument();
  });

  it('shows "Current" badge and disables CTA when isCurrent=true', () => {
    const onSelect = vi.fn();
    render(<PlanCard plan={STARTER} isCurrent onSelect={onSelect} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /current plan/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders select button only when onSelect is provided', () => {
    const { rerender } = render(<PlanCard plan={STARTER} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<PlanCard plan={STARTER} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /select plan/i })).toBeInTheDocument();
  });

  it('invokes onSelect with the plan on click', () => {
    const onSelect = vi.fn();
    render(<PlanCard plan={STARTER} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(STARTER);
  });

  it('returns null when plan is missing', () => {
    const { container } = render(<PlanCard plan={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('uses selectLabel override', () => {
    render(<PlanCard plan={STARTER} onSelect={() => {}} selectLabel="Upgrade now" />);
    expect(screen.getByRole('button', { name: /upgrade now/i })).toBeInTheDocument();
  });

  it('formats an unknown currency as "CODE 49.00"', () => {
    // Intl throws on invalid ISO; billingFormatters falls back to plain string
    const plan = { ...STARTER, currency: 'XYZ' };
    render(<PlanCard plan={plan} />);
    // Either Intl accepts it as "XYZ 49.00" or falls back to our hand-formatted variant
    expect(screen.getByText(/XYZ\s*49\.00/)).toBeInTheDocument();
  });
});
