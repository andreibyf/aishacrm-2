import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock helpers used by LeadProfilePage
vi.mock('../../api/edgeFunctions', () => ({
  getSupabaseAccessToken: vi.fn(async () => 'test-token'),
  getSupabaseFunctionsBase: vi.fn(() => 'https://example.functions.supabase.co'),
}));

// Mock fetch
const originalFetch = globalThis.fetch;

function mockFetchOnce(json, ok = true) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    json: async () => json,
  }));
}

// Import after mocks
import LeadProfilePage from '../LeadProfilePage.jsx';

describe('LeadProfilePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('renders loading state initially', () => {
    render(<LeadProfilePage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders lead summary when data loads', async () => {
    mockFetchOnce({
      id: '123',
      type: 'lead',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone: '555-1234',
      status: 'new',
      score: 42,
      open_opportunity_count: 1,
      recent_activity_count: 3,
    });

    render(<LeadProfilePage />);

    expect(await screen.findByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/555-1234/)).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    render(<LeadProfilePage />);
    expect(await screen.findByText(/error/i)).toBeInTheDocument();
  });
});
