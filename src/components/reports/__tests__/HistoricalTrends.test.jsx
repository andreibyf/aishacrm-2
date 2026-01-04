import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HistoricalTrends from '../HistoricalTrends.jsx';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  Contact: {
    filter: vi.fn(),
  },
  Lead: {
    filter: vi.fn(),
  },
  Opportunity: {
    filter: vi.fn(),
  },
}));

const { Contact, Lead, Opportunity } = await import('@/api/entities');

describe('HistoricalTrends', () => {
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
    const today = new Date().toISOString();
    Contact.filter.mockResolvedValue([
      { id: '1', created_date: today },
      { id: '2', created_date: today },
    ]);
    Lead.filter.mockResolvedValue([
      { id: '1', created_date: today },
    ]);
    Opportunity.filter.mockResolvedValue([
      { id: '1', created_date: today, amount: 5000 },
    ]);

    render(<HistoricalTrends tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Historical Trends')).toBeInTheDocument();
    });

    // Should show metrics
    expect(screen.getByText('New Contacts')).toBeInTheDocument();
    expect(screen.getByText('New Leads')).toBeInTheDocument();
  });

  it('should handle non-array responses gracefully', async () => {
    // Setup: API calls return non-array values (simulating the bug)
    Contact.filter.mockResolvedValue(null); // null instead of array
    Lead.filter.mockResolvedValue(undefined); // undefined instead of array
    Opportunity.filter.mockResolvedValue({ error: 'something went wrong' }); // object instead of array

    render(<HistoricalTrends tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Historical Trends')).toBeInTheDocument();
    });

    // Should not crash and should show zero values
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('New Contacts')).toBeInTheDocument();
  });

  it('should unwrap responses with { data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with data property
    const today = new Date().toISOString();
    Contact.filter.mockResolvedValue({
      data: [
        { id: '1', created_date: today },
        { id: '2', created_date: today },
        { id: '3', created_date: today },
      ],
    });
    Lead.filter.mockResolvedValue({
      data: [
        { id: '1', created_date: today },
        { id: '2', created_date: today },
      ],
    });
    Opportunity.filter.mockResolvedValue({
      data: [
        { id: '1', created_date: today, amount: 10000 },
      ],
    });

    render(<HistoricalTrends tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Historical Trends')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 contacts
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 leads
  });

  it('should unwrap responses with { status: "success", data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with status and data properties
    const today = new Date().toISOString();
    Contact.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', created_date: today },
        { id: '2', created_date: today },
        { id: '3', created_date: today },
        { id: '4', created_date: today },
      ],
    });
    Lead.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', created_date: today },
        { id: '2', created_date: today },
        { id: '3', created_date: today },
      ],
    });
    Opportunity.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', created_date: today, amount: 15000 },
        { id: '2', created_date: today, amount: 20000 },
      ],
    });

    render(<HistoricalTrends tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Historical Trends')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('4')).toBeInTheDocument(); // 4 contacts
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 leads
  });

  it('should show zero values when empty arrays are returned', async () => {
    // Setup: API calls return empty arrays
    Contact.filter.mockResolvedValue([]);
    Lead.filter.mockResolvedValue([]);
    Opportunity.filter.mockResolvedValue([]);

    render(<HistoricalTrends tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Historical Trends')).toBeInTheDocument();
    });

    // Should show stats cards with zero values
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('New Contacts')).toBeInTheDocument();
  });
});
