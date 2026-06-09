/**
 * Component tests for src/components/dashboard/TopOpportunitiesWidget.jsx
 *
 * Covers: rendering the top 3 opportunities from a mocked getDashboard, and the
 * empty-state CTA ("Generate your first insight") when none are returned.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/api/growth', () => ({
  getDashboard: vi.fn(),
}));

vi.mock('@/components/shared/useUser', () => ({
  useUser: vi.fn(),
}));

vi.mock('@/components/shared/useAuthCookiesReady', () => ({
  useAuthCookiesReady: vi.fn(),
}));

import TopOpportunitiesWidget from './TopOpportunitiesWidget';
import { getDashboard } from '@/api/growth';
import { useUser } from '@/components/shared/useUser';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';

const tenantFilter = { tenant_id: 'tenant-123' };

describe('[CRM] TopOpportunitiesWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUser.mockReturnValue({ loading: false });
    useAuthCookiesReady.mockReturnValue({ authCookiesReady: true });
  });

  test('renders the top 3 opportunities from getDashboard', async () => {
    getDashboard.mockResolvedValue({
      current_insight: { id: 'ins-1', status: 'complete' },
      top_opportunities: [
        { id: 'o1', title: 'Expand to Austin', type: 'geographic', score: 91 },
        { id: 'o2', title: 'Offer managed support', type: 'service', score: 80 },
        { id: 'o3', title: 'Publish a comparison guide', type: 'content', score: 66 },
        { id: 'o4', title: 'Should not render', type: 'reputation', score: 40 },
      ],
    });

    render(<TopOpportunitiesWidget tenantFilter={tenantFilter} />);

    await waitFor(() => {
      expect(screen.getByText('Expand to Austin')).toBeInTheDocument();
    });
    expect(getDashboard).toHaveBeenCalledWith('tenant-123');
    expect(screen.getByText('Offer managed support')).toBeInTheDocument();
    expect(screen.getByText('Publish a comparison guide')).toBeInTheDocument();
    // Only top 3 are rendered.
    expect(screen.queryByText('Should not render')).not.toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
  });

  test('shows empty-state CTA when there are no opportunities', async () => {
    getDashboard.mockResolvedValue({
      current_insight: null,
      top_opportunities: [],
    });

    render(<TopOpportunitiesWidget tenantFilter={tenantFilter} />);

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /Generate your first insight/i }),
      ).toBeInTheDocument();
    });
    const cta = screen.getByRole('link', { name: /Generate your first insight/i });
    expect(cta.getAttribute('href')).toContain('tab=insights');
  });
});
