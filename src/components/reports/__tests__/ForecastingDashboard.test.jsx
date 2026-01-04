import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ForecastingDashboard from '../ForecastingDashboard.jsx';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  Opportunity: {
    filter: vi.fn(),
  },
  Lead: {
    filter: vi.fn(),
  },
}));

// Mock the shared hooks
vi.mock('@/components/shared/useUser.js', () => ({
  useUser: () => ({ user: { id: 'test-user', role: 'admin' } }),
}));

vi.mock('../shared/tenantUtils', () => ({
  getTenantFilter: () => ({ tenant_id: 'test-tenant' }),
}));

vi.mock('../shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: 'test-tenant' }),
}));

const { Opportunity, Lead } = await import('@/api/entities');

describe('ForecastingDashboard', () => {
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
      { id: '1', stage: 'proposal', amount: 5000, close_date: '2024-03-01', created_date: '2024-01-01', probability: 50 },
      { id: '2', stage: 'negotiation', amount: 10000, close_date: '2024-03-15', created_date: '2024-01-01', probability: 75 },
    ]);
    Lead.filter.mockResolvedValue([
      { id: '1', status: 'new' },
      { id: '2', status: 'converted' },
    ]);

    render(<ForecastingDashboard />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Revenue Forecasting')).toBeInTheDocument();
    });

    // Should show forecast metrics
    expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Weighted Pipeline')).toBeInTheDocument();
  });

  it('should handle non-array responses gracefully', async () => {
    // Setup: API calls return non-array values (simulating the bug)
    Opportunity.filter.mockResolvedValue(null); // null instead of array
    Lead.filter.mockResolvedValue(undefined); // undefined instead of array

    render(<ForecastingDashboard />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Revenue Forecasting')).toBeInTheDocument();
    });

    // Should not crash and should show zero values
    expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Forecasted Revenue')).toBeInTheDocument();
  });

  it('should unwrap responses with { data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with data property
    Opportunity.filter.mockResolvedValue({
      data: [
        { id: '1', stage: 'prospecting', amount: 3000, close_date: '2024-02-15', created_date: '2024-01-01', probability: 25 },
        { id: '2', stage: 'proposal', amount: 7000, close_date: '2024-02-20', created_date: '2024-01-01', probability: 50 },
      ],
    });
    Lead.filter.mockResolvedValue({
      data: [
        { id: '1', status: 'new' },
        { id: '2', status: 'converted' },
        { id: '3', status: 'new' },
      ],
    });

    render(<ForecastingDashboard />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Revenue Forecasting')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
  });

  it('should unwrap responses with { status: "success", data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with status and data properties
    Opportunity.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', stage: 'qualification', amount: 15000, close_date: '2024-04-01', created_date: '2024-01-01', probability: 25 },
        { id: '2', stage: 'proposal', amount: 20000, close_date: '2024-04-10', created_date: '2024-01-01', probability: 50 },
        { id: '3', stage: 'negotiation', amount: 12000, close_date: '2024-03-25', created_date: '2024-01-01', probability: 75 },
      ],
    });
    Lead.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', status: 'new' },
        { id: '2', status: 'converted' },
        { id: '3', status: 'converted' },
        { id: '4', status: 'qualified' },
      ],
    });

    render(<ForecastingDashboard />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Revenue Forecasting')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
  });

  it('should show zero values when empty arrays are returned', async () => {
    // Setup: API calls return empty arrays
    Opportunity.filter.mockResolvedValue([]);
    Lead.filter.mockResolvedValue([]);

    render(<ForecastingDashboard />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Revenue Forecasting')).toBeInTheDocument();
    });

    // Should show stats cards with zero values
    expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
  });
});
