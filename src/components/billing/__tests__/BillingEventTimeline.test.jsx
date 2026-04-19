/**
 * BillingEventTimeline component tests.
 *
 * Covers: empty state, loading skeletons, event rendering with
 * humanized type + source badge + actor + payload, "Load more" CTA.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BillingEventTimeline from '../BillingEventTimeline';

const EVENTS = [
  {
    id: 'e1',
    event_type: 'payment.received',
    source: 'webhook',
    actor_email: null,
    payload_json: { amount_cents: 4900, invoice_status_after: 'paid' },
    created_at: '2026-04-18T23:20:04Z',
  },
  {
    id: 'e2',
    event_type: 'subscription.assigned',
    source: 'manual',
    actor_email: 'superadmin@aishacrm.com',
    payload_json: null,
    created_at: '2026-04-18T22:00:00Z',
  },
];

describe('BillingEventTimeline', () => {
  it('renders an empty state when events is empty and not loading', () => {
    render(<BillingEventTimeline events={[]} />);
    expect(screen.getByText(/no billing events yet/i)).toBeInTheDocument();
  });

  it('renders skeletons when loading=true and events is empty', () => {
    const { container } = render(<BillingEventTimeline events={[]} loading />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders one list item per event with humanized type', () => {
    render(<BillingEventTimeline events={EVENTS} />);
    expect(screen.getByText('Payment Received')).toBeInTheDocument();
    expect(screen.getByText('Subscription Assigned')).toBeInTheDocument();
  });

  it('renders source badge for each event', () => {
    render(<BillingEventTimeline events={EVENTS} />);
    expect(screen.getByText('webhook')).toBeInTheDocument();
    expect(screen.getByText('manual')).toBeInTheDocument();
  });

  it('renders actor email when present', () => {
    render(<BillingEventTimeline events={EVENTS} />);
    expect(screen.getByText(/superadmin@aishacrm\.com/)).toBeInTheDocument();
  });

  it('does not render actor line when actor_email is null', () => {
    render(<BillingEventTimeline events={[EVENTS[0]]} />);
    expect(screen.queryByText(/^By /)).not.toBeInTheDocument();
  });

  it('renders payload JSON for events that have it', () => {
    render(<BillingEventTimeline events={[EVENTS[0]]} />);
    // Compact JSON serialization includes amount_cents
    expect(screen.getByText(/amount_cents/)).toBeInTheDocument();
  });

  it('renders "Load more" button when onLoadMore is provided', () => {
    const onLoadMore = vi.fn();
    render(<BillingEventTimeline events={EVENTS} onLoadMore={onLoadMore} />);
    const button = screen.getByRole('button', { name: /load more/i });
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('does NOT render "Load more" when onLoadMore is omitted', () => {
    render(<BillingEventTimeline events={EVENTS} />);
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
