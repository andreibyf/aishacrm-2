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

  test('complete state renders report summary and top opportunities', async () => {
    getCurrentInsight.mockResolvedValue({
      id: 'ins-2',
      status: 'complete',
      report: {
        generated_at: '2026-06-08T12:00:00.000Z',
        signal_counts: { trends: 7, autocomplete: 12 },
        opportunity_count: 2,
        top: [
          { title: 'Expand into fintech', score: 88, type: 'market_entry' },
          { title: 'Partner with X', score: 71, type: 'partnership' },
        ],
      },
    });

    render(<AIMarketInsights tenant={tenant} />);

    await waitFor(() => {
      expect(screen.getByText('Top Opportunities')).toBeInTheDocument();
    });
    expect(screen.getByText('Expand into fintech')).toBeInTheDocument();
    expect(screen.getByText('Partner with X')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText(/Trends: 7/i)).toBeInTheDocument();
    expect(screen.getByText(/Autocomplete: 12/i)).toBeInTheDocument();
    expect(screen.getByText(/As of/i)).toBeInTheDocument();
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
      expect(screen.getByText('Market Summary')).toBeInTheDocument();
    });
    const generateBtn = screen.getByRole('button', { name: /Generate Insight/i });
    expect(generateBtn).toBeInTheDocument();
    expect(generateBtn).not.toBeDisabled();
  });
});
