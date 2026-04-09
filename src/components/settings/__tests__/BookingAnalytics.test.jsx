import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BookingAnalytics from '../../scheduling/BookingAnalytics.jsx';

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock('recharts', () => {
  const MockChart = ({ children }) => children || null;
  return {
    BarChart: MockChart,
    Bar: () => null,
    LineChart: MockChart,
    Line: () => null,
    PieChart: MockChart,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: ({ children }) => children || null,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}));

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'https://api.example.com',
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
        error: null,
      })),
    },
  },
}));

function makeJsonResponse(data, ok = true) {
  return {
    ok,
    headers: {
      get: () => 'application/json; charset=utf-8',
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function makeHtmlResponse(body = '<!doctype html><html></html>', ok = false) {
  return {
    ok,
    headers: {
      get: () => 'text/html; charset=utf-8',
    },
    json: async () => {
      throw new SyntaxError("Unexpected token '<'");
    },
    text: async () => body,
  };
}

describe('BookingAnalytics', () => {
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the analytics endpoints through the resolved backend URL', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: 'success',
          data: {
            total: 0,
            by_status: {},
            completion_rate_pct: 0,
            no_show_rate_pct: 0,
            avg_lead_time_days: null,
            daily_trend: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: 'success',
          data: {
            total_revenue_cents: 0,
            packages: [],
            credit_utilization: { total_purchased: 0, total_used: 0, utilization_rate_pct: 0 },
            popular_slots: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: 'success',
          data: {
            balance_distribution: [],
            top_bookers: [],
            avg_days_to_first_booking: null,
            active_credit_holders: 0,
          },
        }),
      );

    render(<BookingAnalytics tenantId="tenant-123" />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^https:\/\/api\.example\.com\/api\/analytics\/bookings\?/),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^https:\/\/api\.example\.com\/api\/analytics\/packages\?/),
      expect.any(Object),
    );

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      'https://api.example.com/api/analytics/credits-utilization?tenant_id=tenant-123',
      expect.any(Object),
    );

    await waitFor(() => {
      expect(screen.getByText('Booking Analytics')).toBeInTheDocument();
    });
  });

  it('shows a helpful error when the server returns HTML instead of JSON', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(makeHtmlResponse())
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: 'success',
          data: {
            total_revenue_cents: 0,
            packages: [],
            credit_utilization: { total_purchased: 0, total_used: 0, utilization_rate_pct: 0 },
            popular_slots: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          status: 'success',
          data: {
            balance_distribution: [],
            top_bookers: [],
            avg_days_to_first_booking: null,
            active_credit_holders: 0,
          },
        }),
      );

    render(<BookingAnalytics tenantId="tenant-123" />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Failed to load booking stats. The server returned HTML instead of JSON.',
      );
    });

    expect(
      screen.getByText('Failed to load booking stats. The server returned HTML instead of JSON.'),
    ).toBeInTheDocument();
  });
});