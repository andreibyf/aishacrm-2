import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProductivityAnalytics from '../ProductivityAnalytics.jsx';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  Activity: {
    filter: vi.fn(),
  },
  User: {
    filter: vi.fn(),
  },
}));

const { Activity, User } = await import('@/api/entities');

describe('ProductivityAnalytics', () => {
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
    Activity.filter.mockResolvedValue([
      { id: '1', userId: 'user1', status: 'completed', type: 'call', due_date: '2024-01-01', created_date: '2024-01-01' },
      { id: '2', userId: 'user1', status: 'pending', type: 'email', due_date: '2024-01-02', created_date: '2024-01-01' },
    ]);
    User.filter.mockResolvedValue([
      { id: 'user1', name: 'John Doe' },
    ]);

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should show the activities count
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should handle non-array responses gracefully', async () => {
    // Setup: API calls return non-array values (simulating the bug)
    Activity.filter.mockResolvedValue(null); // null instead of array
    User.filter.mockResolvedValue(undefined); // undefined instead of array

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should not crash and should show zero values
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
  });

  it('should unwrap responses with { data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with data property
    Activity.filter.mockResolvedValue({
      data: [
        { id: '1', userId: 'user1', status: 'completed', type: 'call', due_date: '2024-01-01', created_date: '2024-01-01' },
        { id: '2', userId: 'user1', status: 'completed', type: 'email', due_date: '2024-01-02', created_date: '2024-01-01' },
      ],
    });
    User.filter.mockResolvedValue({
      data: [
        { id: 'user1', name: 'John Doe' },
      ],
    });

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should unwrap responses with { status: "success", data: [...] } shape', async () => {
    // Setup: API calls return wrapped responses with status and data properties
    Activity.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: '1', userId: 'user1', status: 'completed', type: 'call', due_date: '2024-01-01', created_date: '2024-01-01' },
        { id: '2', userId: 'user1', status: 'pending', type: 'email', due_date: '2024-01-02', created_date: '2024-01-01' },
        { id: '3', userId: 'user2', status: 'completed', type: 'meeting', due_date: '2024-01-03', created_date: '2024-01-01' },
      ],
    });
    User.filter.mockResolvedValue({
      status: 'success',
      data: [
        { id: 'user1', name: 'John Doe' },
        { id: 'user2', name: 'Jane Smith' },
      ],
    });

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should correctly process the unwrapped data
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should show zero values when empty arrays are returned', async () => {
    // Setup: API calls return empty arrays
    Activity.filter.mockResolvedValue([]);
    User.filter.mockResolvedValue([]);

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should show stats cards with zero values
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('should unwrap V2 API responses with { activities: [...], total, counts } shape', async () => {
    // Setup: V2 API format (actual backend response structure)
    Activity.filter.mockResolvedValue({
      activities: [
        { id: '1', userId: 'user1', status: 'completed', type: 'call', due_date: '2024-01-01', created_date: '2024-01-01' },
        { id: '2', userId: 'user1', status: 'in_progress', type: 'email', due_date: '2024-01-02', created_date: '2024-01-01' },
      ],
      total: 2,
      limit: 50,
      offset: 0,
      counts: {
        scheduled: 0,
        in_progress: 1,
        completed: 1,
        cancelled: 0,
      },
    });
    User.filter.mockResolvedValue([
      { id: 'user1', name: 'John Doe' },
    ]);

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should correctly unwrap and process the activities array
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should unwrap nested V2 API responses with { data: { activities: [...] } } shape', async () => {
    // Setup: Nested V2 API format (entities.js unwrapping may produce this)
    Activity.filter.mockResolvedValue({
      data: {
        activities: [
          { id: '1', userId: 'user1', status: 'completed', type: 'call', due_date: '2024-01-01', created_date: '2024-01-01' },
        ],
        total: 1,
      },
    });
    User.filter.mockResolvedValue([
      { id: 'user1', name: 'John Doe' },
    ]);

    render(<ProductivityAnalytics tenantFilter={{ tenant_id: 'test-tenant' }} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Should correctly unwrap and process the activities array
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
