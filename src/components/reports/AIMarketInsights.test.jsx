/**
 * Component tests for src/components/reports/AIMarketInsights.jsx
 *
 * Covers the insight state machine: loading → idle, running (ETA),
 * complete (report summary + top opportunities), failed (error + retry),
 * Generate transition, 429 cooldown, and superadmin Generate visibility.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/growth', () => ({
  getCurrentInsight: vi.fn(),
  requestInsightRun: vi.fn(),
}));

vi.mock('@/components/shared/useUser.js', () => ({
  useUser: vi.fn(),
}));

import AIMarketInsights from './AIMarketInsights';
import { getCurrentInsight, requestInsightRun } from '@/api/growth';
import { useUser } from '@/components/shared/useUser.js';

const tenant = { id: 'tenant-123', name: 'Acme Corp' };

describe('[CRM] AIMarketInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUser.mockReturnValue({ user: { id: 'u1', role: 'user' } });
    getCurrentInsight.mockResolvedValue(null);
  });

  test('loading then idle when no insight exists', async () => {
    getCurrentInsight.mockResolvedValue(null);

    render(<AIMarketInsights tenant={tenant} />);

    // loading spinner shows initially
    expect(screen.getByTestId('insights-loading')).toBeInTheDocument();

    // resolves to idle: explanatory copy + Generate Insight button
    await waitFor(() => {
      expect(
        screen.getByText(/No market intelligence has been generated yet/i),
      ).toBeInTheDocument();
    });
    expect(getCurrentInsight).toHaveBeenCalledWith('tenant-123');
    expect(screen.getByRole('button', { name: /Generate Insight/i })).toBeInTheDocument();
  });

  test('running state shows ETA text and refresh button', async () => {
    getCurrentInsight.mockResolvedValue({
      id: 'ins-1',
      status: 'running',
      eta_seconds: 180,
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText(/Running —/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/about ~3 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/notified/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  test('complete state renders the rich market intelligence report + signals meta', async () => {
    getCurrentInsight.mockResolvedValue({
      id: 'ins-2',
      status: 'complete',
      report: {
        generated_at: '2026-06-08T12:00:00.000Z',
        signal_counts: { trends: 7, autocomplete: 12 },
        opportunity_count: 2,
        top: [],
        market_insights: {
          executive_summary: 'Acme should double down on fintech.',
          market_overview: 'The market is growing.',
          swot_analysis: {
            strengths: ['Strong brand'],
            weaknesses: ['Thin pipeline'],
            opportunities: ['Adjacent verticals'],
            threats: ['New entrants'],
          },
          competitive_landscape: {
            overview: 'Crowded but winnable.',
            major_competitors: ['Globex'],
            market_dynamics: 'Price pressure.',
          },
          industry_trends: [{ name: 'AI adoption', description: 'Everywhere', impact: 'high' }],
          major_news: [
            { title: 'Big merger', description: 'X buys Y', date: '2026-06-01', impact: 'neutral' },
          ],
          economic_indicators: [
            { name: 'GDP Growth', current_value: 2.2, trend: 'up', unit: 'percent' },
          ],
          recommendations: [
            {
              title: 'Tighten ICP',
              description: 'Focus on fintech buyers.',
              priority: 'high',
              action_items: ['Analyze closed-won'],
              timeline: 'short-term (1-3 months)',
              expected_impact: '15-25% more pipeline',
            },
          ],
        },
      },
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText('Acme should double down on fintech.')).toBeInTheDocument();
    });
    // Rich report sections
    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(screen.getByText('Strong brand')).toBeInTheDocument();
    expect(screen.getByText('Competitive Landscape')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Tighten ICP')).toBeInTheDocument();
    expect(screen.getByText('2.2%')).toBeInTheDocument();
    // Compact signals meta still present; the opportunities list is NOT here.
    expect(screen.getByText(/Trends: 7/i)).toBeInTheDocument();
    expect(screen.getByText(/Autocomplete: 12/i)).toBeInTheDocument();
    expect(screen.queryByText('Top Opportunities')).not.toBeInTheDocument();
    expect(screen.getByText(/As of/i)).toBeInTheDocument();
  });

  test('complete state without a rich report shows the synthesis-error note', async () => {
    getCurrentInsight.mockResolvedValue({
      id: 'ins-2b',
      status: 'complete',
      report: {
        generated_at: '2026-06-08T12:00:00.000Z',
        signal_counts: { trends: 0, autocomplete: 5 },
        opportunity_count: 3,
        top: [],
        market_insights_error: 'claude unavailable',
      },
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(
        screen.getByText(/market intelligence report could not be generated/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/claude unavailable/i)).toBeInTheDocument();
  });

  test('failed state shows error and retry button', async () => {
    getCurrentInsight.mockResolvedValue({
      id: 'ins-3',
      status: 'failed',
      error: 'Signal provider timed out',
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText('Signal provider timed out')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  test('Generate click calls requestInsightRun and transitions to running', async () => {
    getCurrentInsight.mockResolvedValue(null);
    requestInsightRun.mockResolvedValue({
      ok: true,
      data: { id: 'ins-new', status: 'running', eta_seconds: 240 },
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Insight/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Generate Insight/i }));

    await waitFor(() => {
      expect(requestInsightRun).toHaveBeenCalledWith('tenant-123');
      expect(screen.getByText(/Running —/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/about ~4 minutes/i)).toBeInTheDocument();
  });

  test('429 response shows next-available message', async () => {
    getCurrentInsight.mockResolvedValue(null);
    requestInsightRun.mockResolvedValue({
      ok: false,
      status: 429,
      next_available_at: '2026-06-09T15:00:00.000Z',
      message: 'cooldown',
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Insight/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Generate Insight/i }));

    await waitFor(() => {
      expect(screen.getByText(/Next insight available/i)).toBeInTheDocument();
    });
    // still in idle state (no running transition)
    expect(screen.queryByText(/Running —/i)).not.toBeInTheDocument();
  });

  test('superadmin sees Generate enabled even when a complete insight exists', async () => {
    useUser.mockReturnValue({ user: { id: 'admin1', role: 'superadmin' } });
    getCurrentInsight.mockResolvedValue({
      id: 'ins-4',
      status: 'complete',
      report: {
        generated_at: '2026-06-08T12:00:00.000Z',
        signal_counts: { trends: 1, autocomplete: 2 },
        opportunity_count: 0,
        top: [],
      },
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText(/Trends: 1/i)).toBeInTheDocument();
    });
    const generateBtn = screen.getByRole('button', { name: /Generate Insight/i });
    expect(generateBtn).toBeInTheDocument();
    expect(generateBtn).not.toBeDisabled();
  });
});
