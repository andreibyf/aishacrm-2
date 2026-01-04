import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LeadAnalytics from '../LeadAnalytics.jsx';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  Lead: {
    filter: vi.fn(),
  },
}));

const { Lead } = await import('@/api/entities');

describe('LeadAnalytics', () => {
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
    Lead.filter.mockResolvedValue([
      { id: '1', status: 'new', source: 'website', score: 50, created_date: '2024-01-01' },
      { id: '2', status: 'converted', source: 'referral', score: 80, created_date: '2024-01-02' },
    ]);

    render(<LeadAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
    });

    // Should show lead counts
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
  });

  it('should handle non-array responses gracefully', async () => {
    // Setup: API calls return non-array values (simulating the bug)
    Lead.filter.mockResolvedValue(null); // null instead of array

    render(<LeadAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
    });

    // Should not crash and should show zero values
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
  });

  it('should unwrap responses with { data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with data property
    Lead.filter.mockResolvedValue({
      data: [
        { id: '1', status: 'qualified', source: 'website', score: 70, created_date: '2024-01-01' },
        { id: '2', status: 'converted', source: 'email', score: 90, created_date: '2024-01-02' },
        { id: '3', status: 'new', source: 'referral', score: 40, created_date: '2024-01-03' },
      ],
    });

    render(<LeadAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should unwrap responses with { status: "success", data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with status and data properties
    Lead.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', status: 'new', source: 'website', score: 60, created_date: '2024-01-01', estimated_value: 1000 },
        { id: '2', status: 'converted', source: 'referral', score: 85, created_date: '2024-01-02', estimated_value: 2000 },
        { id: '3', status: 'converted', source: 'email', score: 75, created_date: '2024-01-03', estimated_value: 1500 },
        { id: '4', status: 'qualified', source: 'social_media', score: 50, created_date: '2024-01-04', estimated_value: 500 },
      ],
    });

    render(<LeadAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument(); // 2 converted out of 4 = 50%
  });

  it('should show zero values when empty arrays are returned', async () => {
    // Setup: API calls return empty arrays
    Lead.filter.mockResolvedValue([]);

    render(<LeadAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
    });

    // Should show stats cards with zero values - check for specific text or use getAllByText
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('should handle missing tenant filter gracefully', async () => {
    // Setup: no tenant filter provided
    Lead.filter.mockResolvedValue([]);

    render(<LeadAnalytics tenantFilter={null} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
    });

    // Should show zero values without calling API
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(Lead.filter).not.toHaveBeenCalled();
  });
});
