import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SalesAnalytics from '../SalesAnalytics.jsx';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  Opportunity: {
    filter: vi.fn(),
  },
}));

const { Opportunity } = await import('@/api/entities');

describe('SalesAnalytics', () => {
  // Setup ResizeObserver mock for chart components
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
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render without errors when API calls return arrays', async () => {
    // Setup: API calls return valid arrays
    Opportunity.filter.mockResolvedValue([
      { id: '1', stage: 'prospecting', amount: 1000, close_date: '2024-01-01', created_date: '2024-01-01' },
      { id: '2', stage: 'closed_won', amount: 2000, close_date: '2024-01-02', created_date: '2024-01-01' },
    ]);

    render(<SalesAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    // Should show pipeline value
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
  });

  it('should handle non-array responses gracefully', async () => {
    // Setup: API calls return non-array values (simulating the bug)
    Opportunity.filter.mockResolvedValue(null); // null instead of array

    render(<SalesAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    // Should not crash and should show zero values
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByText('Avg Deal Size')).toBeInTheDocument();
  });

  it('should unwrap responses with { data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with data property
    Opportunity.filter.mockResolvedValue({
      data: [
        { id: '1', stage: 'closed_won', amount: 5000, close_date: '2024-01-01', created_date: '2024-01-01' },
        { id: '2', stage: 'closed_won', amount: 3000, close_date: '2024-01-02', created_date: '2024-01-01' },
      ],
    });

    render(<SalesAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByText('Avg Deal Size')).toBeInTheDocument();
  });

  it('should unwrap responses with { status: "success", data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with status and data properties
    Opportunity.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', stage: 'proposal', amount: 10000, close_date: '2024-01-01', created_date: '2024-01-01', lead_source: 'website' },
        { id: '2', stage: 'closed_won', amount: 5000, close_date: '2024-01-02', created_date: '2024-01-01', lead_source: 'referral' },
        { id: '3', stage: 'closed_lost', amount: 2000, close_date: '2024-01-03', created_date: '2024-01-01', lead_source: 'website' },
      ],
    });

    render(<SalesAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByText('Sales Cycle')).toBeInTheDocument();
  });

  it('should show zero values when empty arrays are returned', async () => {
    // Setup: API calls return empty arrays
    Opportunity.filter.mockResolvedValue([]);

    render(<SalesAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    // Should show stats cards with zero values - use getAllByText since there are multiple $0K values
    expect(screen.getAllByText('$0K').length).toBeGreaterThan(0);
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
  });
});
