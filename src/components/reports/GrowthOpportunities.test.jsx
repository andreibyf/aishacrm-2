/**
 * Component tests for src/components/reports/GrowthOpportunities.jsx
 *
 * Covers: rendering scored cards from listOpportunities, Dismiss (calls
 * dismissOpportunity + optimistic removal), Action (calls actionOpportunity),
 * and the empty state when no opportunities exist.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/growth', () => ({
  listOpportunities: vi.fn(),
  dismissOpportunity: vi.fn(),
  actionOpportunity: vi.fn(),
  // GrowthProfileEditor (child) imports these — provide no-op mocks.
  getProfile: vi.fn().mockResolvedValue({}),
  saveProfile: vi.fn().mockResolvedValue({}),
}));

import GrowthOpportunities from './GrowthOpportunities';
import { listOpportunities, dismissOpportunity, actionOpportunity } from '@/api/growth';

const tenant = { id: 'tenant-123', name: 'Acme Corp' };

const sampleOpps = [
  {
    id: 'opp-1',
    type: 'geographic',
    title: 'Expand to Austin',
    reason: 'Rising search demand in Austin metro',
    score: 88,
    expected_impact: 'high',
    difficulty: 'medium',
    recommended_action: 'Launch a localized landing page',
    action_type: 'content',
    status: 'open',
    created_at: '2026-06-08T12:00:00.000Z',
  },
  {
    id: 'opp-2',
    type: 'service',
    title: 'Offer managed support',
    reason: 'Competitors lack this tier',
    score: 72,
    expected_impact: 'medium',
    difficulty: 'low',
    recommended_action: 'Draft a support package',
    action_type: 'service',
    status: 'open',
    created_at: '2026-06-08T12:00:00.000Z',
  },
];

describe('[CRM] GrowthOpportunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOpportunities.mockResolvedValue(sampleOpps);
    dismissOpportunity.mockResolvedValue({ opportunity: { id: 'opp-1', status: 'dismissed' } });
    actionOpportunity.mockResolvedValue({ opportunity: { id: 'opp-1', status: 'actioned' } });
  });

  test('renders scored cards from listOpportunities', async () => {
    render(<GrowthOpportunities tenant={tenant} />);

    expect(screen.getByTestId('opportunities-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Expand to Austin')).toBeInTheDocument();
    });
    expect(listOpportunities).toHaveBeenCalledWith('tenant-123', {});
    expect(screen.getByText('Offer managed support')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText(/Rising search demand/i)).toBeInTheDocument();
    expect(screen.getByText(/Launch a localized landing page/i)).toBeInTheDocument();
  });

  test('Dismiss calls dismissOpportunity and removes the card', async () => {
    render(<GrowthOpportunities tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText('Expand to Austin')).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByRole('button', { name: /Dismiss/i });
    fireEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(dismissOpportunity).toHaveBeenCalledWith('tenant-123', 'opp-1', 'not_relevant');
    });
    // Optimistic removal — first card gone, second remains.
    await waitFor(() => {
      expect(screen.queryByText('Expand to Austin')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Offer managed support')).toBeInTheDocument();
  });

  test('Action calls actionOpportunity and marks the card actioned', async () => {
    render(<GrowthOpportunities tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText('Expand to Austin')).toBeInTheDocument();
    });

    const actionButtons = screen.getAllByRole('button', { name: /^Action$/i });
    fireEvent.click(actionButtons[0]);

    await waitFor(() => {
      expect(actionOpportunity).toHaveBeenCalledWith('tenant-123', 'opp-1', {});
    });
    await waitFor(() => {
      expect(screen.getByText('Actioned')).toBeInTheDocument();
    });
  });

  test('shows empty state when no opportunities exist', async () => {
    listOpportunities.mockResolvedValue([]);

    render(<GrowthOpportunities tenant={tenant} />);

    await waitFor(() => {
      expect(
        screen.getByText(/No opportunities yet — generate an insight from the AI Insights tab/i),
      ).toBeInTheDocument();
    });
  });
});
