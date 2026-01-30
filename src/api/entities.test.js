/**
 * Unit tests for src/api/entities.js
 * Tests include module import and MongoDB filter encoding
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null }))
    }
  },
  isSupabaseConfigured: vi.fn(() => false)
}));

// Mock fetch to capture requests
let mockFetchCalls = [];
const mockFetch = vi.fn((url, options) => {
  mockFetchCalls.push({ url, options });
  return Promise.resolve({ 
    ok: true, 
    json: () => Promise.resolve({ status: 'success', data: [] }) 
  });
});
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

describe('entities.js', () => {
  beforeEach(() => {
    mockFetchCalls = [];
    mockFetch.mockClear();
    localStorageMock.getItem.mockReturnValue('test-tenant-id');
  });

  test('module can be imported without errors', async () => {
    // The main test is that this import succeeds without throwing
    const module = await import('./entities');
    
    // Verify it's a valid module with exports
    expect(module).toBeDefined();
    expect(Object.keys(module).length).toBeGreaterThan(0);
    
    // Log what we got for visibility
    console.log('Entities module exports:', Object.keys(module).slice(0, 10).join(', '), '...');
  });

  test('MongoDB-style filters are wrapped in filter parameter', async () => {
    const { Activity } = await import('./entities');
    
    // Call Activity.filter with MongoDB-style $or and $regex
    const searchFilter = {
      $or: [
        { subject: { $regex: 'test search', $options: 'i' } },
        { description: { $regex: 'test search', $options: 'i' } },
        { related_name: { $regex: 'test search', $options: 'i' } }
      ]
    };
    
    try {
      await Activity.filter(searchFilter);
    } catch {
      // Expected to fail due to mocking, but we can still check the URL
    }
    
    // Verify the request was made
    expect(mockFetchCalls.length).toBeGreaterThan(0);
    
    const lastCall = mockFetchCalls[mockFetchCalls.length - 1];
    const url = new URL(lastCall.url, 'http://localhost');
    
    // Should have tenant_id
    expect(url.searchParams.has('tenant_id')).toBe(true);
    
    // Should have filter parameter with JSON-encoded MongoDB operators
    expect(url.searchParams.has('filter')).toBe(true);
    
    const filterParam = url.searchParams.get('filter');
    const parsedFilter = JSON.parse(filterParam);
    
    // Verify the filter contains the $or array
    expect(parsedFilter).toHaveProperty('$or');
    expect(Array.isArray(parsedFilter.$or)).toBe(true);
    expect(parsedFilter.$or.length).toBe(3);
    
    // Verify each condition has $regex
    parsedFilter.$or.forEach(condition => {
      const field = Object.keys(condition)[0];
      expect(condition[field]).toHaveProperty('$regex');
      expect(condition[field].$regex).toBe('test search');
    });
    
    // Should NOT have $or as a direct query parameter
    expect(url.searchParams.has('$or')).toBe(false);
  });

  test('Simple filters remain as direct query parameters', async () => {
    const { Activity } = await import('./entities');
    
    // Call Activity.filter with simple parameters
    const simpleFilter = {
      status: 'completed',
      type: 'call'
    };
    
    try {
      await Activity.filter(simpleFilter);
    } catch {
      // Expected to fail due to mocking
    }
    
    const lastCall = mockFetchCalls[mockFetchCalls.length - 1];
    const url = new URL(lastCall.url, 'http://localhost');
    
    // Should have tenant_id
    expect(url.searchParams.has('tenant_id')).toBe(true);
    
    // Should have status and type as direct parameters
    expect(url.searchParams.get('status')).toBe('completed');
    expect(url.searchParams.get('type')).toBe('call');
    
    // Should NOT have filter parameter
    expect(url.searchParams.has('filter')).toBe(false);
  });

  test('Mixed filters separate MongoDB operators from simple params', async () => {
    const { Activity } = await import('./entities');
    
    // Call Activity.filter with mixed parameters
    const mixedFilter = {
      status: 'scheduled',
      $or: [
        { assigned_to: null },
        { assigned_to: '' }
      ]
    };
    
    try {
      await Activity.filter(mixedFilter);
    } catch {
      // Expected to fail due to mocking
    }
    
    const lastCall = mockFetchCalls[mockFetchCalls.length - 1];
    const url = new URL(lastCall.url, 'http://localhost');
    
    // Should have tenant_id
    expect(url.searchParams.has('tenant_id')).toBe(true);
    
    // Should have status as direct parameter
    expect(url.searchParams.get('status')).toBe('scheduled');
    
    // Should have filter parameter with $or
    expect(url.searchParams.has('filter')).toBe(true);
    const filterParam = url.searchParams.get('filter');
    const parsedFilter = JSON.parse(filterParam);
    expect(parsedFilter).toHaveProperty('$or');
  });

  test('GET by ID includes tenant_id as query parameter', async () => {
    const { Account } = await import('./entities');
    
    // Call Account.get with an ID
    const testId = 'test-account-id-123';
    
    try {
      await Account.get(testId);
    } catch {
      // Expected to fail due to mocking
    }
    
    const lastCall = mockFetchCalls[mockFetchCalls.length - 1];
    const url = new URL(lastCall.url, 'http://localhost');
    
    // Should have ID in path
    expect(url.pathname).toContain(testId);
    
    // Should have tenant_id as query parameter (not in body)
    expect(url.searchParams.has('tenant_id')).toBe(true);
    expect(url.searchParams.get('tenant_id')).toBe('test-tenant-id');
    
    // Should be a GET request with no body
    expect(lastCall.options.method).toBe('GET');
    expect(lastCall.options.body).toBeUndefined();
  });
});
