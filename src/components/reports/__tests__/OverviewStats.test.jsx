import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OverviewStats from '../OverviewStats.jsx';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  Lead: {
    filter: vi.fn(),
  },
  Opportunity: {
    filter: vi.fn(),
  },
  Account: {
    filter: vi.fn(),
  },
}));

// Mock the backend URL
vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:4001',
}));

const { Lead, Opportunity, Account } = await import('@/api/entities');

describe('OverviewStats', () => {
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
    
    // Mock fetch for dashboard stats
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            data: {
              totalContacts: 10,
              totalActivities: 5,
              trends: {},
            },
          }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render without errors when API calls return arrays', async () => {
    // Setup: API calls return valid arrays
    Lead.filter.mockResolvedValue([
      { id: '1', source: 'website' },
      { id: '2', source: 'referral' },
    ]);
    Opportunity.filter.mockResolvedValue([
      { id: '1', stage: 'prospecting', value: '1000' },
      { id: '2', stage: 'proposal', value: '2000' },
    ]);
    Account.filter.mockResolvedValue([
      { id: '1', name: 'Account 1' },
    ]);

    render(<OverviewStats tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    });

    // Should not show error message
    expect(screen.queryByText('Failed to load overview stats')).not.toBeInTheDocument();
  });

  it('should handle non-array responses gracefully', async () => {
    // Setup: API calls return non-array values (simulating the bug)
    Lead.filter.mockResolvedValue(null); // null instead of array
    Opportunity.filter.mockResolvedValue(undefined); // undefined instead of array
    Account.filter.mockResolvedValue({ error: 'something went wrong' }); // object instead of array

    render(<OverviewStats tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    });

    // Should not crash and should show zero values
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Active Accounts')).toBeInTheDocument();
    
    // Should not show error message (data defaults to empty arrays)
    expect(screen.queryByText('Failed to load overview stats')).not.toBeInTheDocument();
  });

  it('should display error message when API calls fail', async () => {
    // Setup: API calls throw errors
    Lead.filter.mockRejectedValue(new Error('Network error'));
    Opportunity.filter.mockResolvedValue([]);
    Account.filter.mockResolvedValue([]);

    render(<OverviewStats tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to load overview stats')).toBeInTheDocument();
    });

    // Error message should contain details
    expect(screen.getByText(/Network error/i)).toBeInTheDocument();
  });

  it('should display error when backend API fails', async () => {
    // Setup: Backend API returns error
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    );

    Lead.filter.mockResolvedValue([]);
    Opportunity.filter.mockResolvedValue([]);
    Account.filter.mockResolvedValue([]);

    render(<OverviewStats tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to load overview stats')).toBeInTheDocument();
    });

    // Error message should contain backend error
    expect(screen.getByText(/Backend API error/i)).toBeInTheDocument();
  });

  it('should show zero values when empty arrays are returned', async () => {
    // Setup: API calls return empty arrays
    Lead.filter.mockResolvedValue([]);
    Opportunity.filter.mockResolvedValue([]);
    Account.filter.mockResolvedValue([]);

    render(<OverviewStats tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    });

    // Should show stats cards without errors
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Active Accounts')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Value')).toBeInTheDocument();
  });
});
