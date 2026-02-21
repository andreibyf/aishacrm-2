/**
 * CustomQuery — Phase 4 Vitest Tests
 *
 * Verifies that saved reports use the API (not localStorage) and that
 * the key UI flows work correctly:
 *
 *  1. Saved reports panel fetches from GET /api/pep/saved-reports
 *  2. Save Report calls POST /api/pep/saved-reports
 *  3. Duplicate name shows toast error (409 response)
 *  4. Delete calls DELETE /api/pep/saved-reports/:id
 *  5. Running a saved report calls PATCH .../run (fire-and-forget)
 *  6. localStorage is never read or written
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CustomQuery from '../CustomQuery.jsx';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:3001',
}));

vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: 'tenant-test-uuid' }),
}));

vi.mock('@/components/shared/useUser', () => ({
  useUser: () => ({ user: { email: 'user@test.com', tenant_id: 'tenant-test-uuid' } }),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-test-uuid';
const BACKEND = 'http://localhost:3001';

const SAVED_REPORT = {
  id: 'report-uuid-1',
  report_name: 'Open Leads',
  plain_english: 'Show me open leads',
  compiled_ir: { op: 'query_entity', target: 'leads', table: 'leads', filters: [], limit: 100 },
  run_count: 3,
  last_run_at: '2026-02-20T12:00:00Z',
  created_by: 'alice@test.com',
  created_at: '2026-02-01T10:00:00Z',
};

function mockFetch(handlers) {
  globalThis.fetch = vi.fn((url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    for (const [pattern, handler] of handlers) {
      if (typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)) {
        const match = handler[method] || handler['*'];
        if (match) return Promise.resolve(match());
      }
    }
    // Default: unhandled request returns 200 success
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: [] }),
    });
  });
}

function renderCustomQuery() {
  return render(<CustomQuery tenantFilter={{ tenant_id: TENANT_ID }} />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CustomQuery — Phase 4 Saved Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure localStorage is clean and we can spy on it
    localStorage.clear();
    vi.spyOn(Storage.prototype, 'getItem');
    vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Saved reports panel fetches from API ─────────────────────────────────

  it('loads saved reports from API when panel is opened', async () => {
    mockFetch([
      [
        `${BACKEND}/api/pep/saved-reports`,
        {
          GET: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success', data: [SAVED_REPORT] }),
          }),
        },
      ],
    ]);

    renderCustomQuery();

    // Open saved reports panel
    fireEvent.click(screen.getByText(/Saved Reports/i));

    // Should show the report name and metadata
    await waitFor(() => {
      expect(screen.getByText('Open Leads')).toBeInTheDocument();
    });
    expect(screen.getByText(/alice@test\.com/)).toBeInTheDocument();
    expect(screen.getByText(/3 runs/)).toBeInTheDocument();

    // Verify it called the API, not localStorage
    expect(Storage.prototype.getItem).not.toHaveBeenCalled();
  });

  // ── 2. localStorage is never used ──────────────────────────────────────────

  it('never reads or writes localStorage for saved reports', async () => {
    mockFetch([
      [
        `${BACKEND}/api/pep/saved-reports`,
        {
          GET: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success', data: [] }),
          }),
        },
      ],
    ]);

    renderCustomQuery();
    fireEvent.click(screen.getByText(/Saved Reports/i));

    await waitFor(() => {
      expect(screen.getByText(/No saved reports yet/i)).toBeInTheDocument();
    });

    expect(Storage.prototype.getItem).not.toHaveBeenCalled();
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });

  // ── 3. Save Report calls POST /api/pep/saved-reports ───────────────────────

  it('POSTs to API when saving a report', async () => {
    const postSpy = vi.fn(() => ({
      ok: true,
      json: () =>
        Promise.resolve({ status: 'success', data: { id: 'new-uuid', report_name: 'My Report' } }),
    }));

    mockFetch([
      [
        `${BACKEND}/api/pep/compile`,
        {
          POST: () => ({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'success',
                data: {
                  ir: SAVED_REPORT.compiled_ir,
                  confirmation: 'Showing leads',
                  braid_ir: {},
                  semantic_frame: {},
                  plan: {},
                  audit: {},
                  target: 'leads',
                  target_kind: 'entity',
                },
              }),
          }),
        },
      ],
      [
        `${BACKEND}/api/pep/query`,
        {
          POST: () => ({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'success',
                data: {
                  rows: [{ id: '1', first_name: 'Test' }],
                  count: 1,
                  target: 'leads',
                  target_kind: 'entity',
                  executed_at: new Date().toISOString(),
                },
              }),
          }),
        },
      ],
      [
        `${BACKEND}/api/pep/saved-reports`,
        {
          POST: postSpy,
          GET: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success', data: [] }),
          }),
        },
      ],
    ]);

    renderCustomQuery();

    // Type a query and run it
    const textarea = screen.getByPlaceholderText(/Ask a question/i);
    fireEvent.change(textarea, { target: { value: 'Show me open leads' } });
    fireEvent.click(screen.getByRole('button', { name: /Run/i }));

    // Wait for results to appear
    await waitFor(() => {
      expect(screen.getByText(/Save Report/i)).toBeInTheDocument();
    });

    // Click Save Report
    fireEvent.click(screen.getByText(/Save Report/i));
    const nameInput = screen.getByPlaceholderText(/Report name/i);
    fireEvent.change(nameInput, { target: { value: 'My Report' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalled();
    });

    // Confirm POST body includes the right fields
    const callArgs = JSON.parse(postSpy.mock.calls[0][1]?.body || '{}');
    // Note: postSpy is called as fetch(url, opts), so body is in opts
    const fetchCall = globalThis.fetch.mock.calls.find(
      ([url, opts]) => url.includes('saved-reports') && opts?.method === 'POST',
    );
    expect(fetchCall).toBeTruthy();
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tenant_id).toBe(TENANT_ID);
    expect(body.report_name).toBe('My Report');
    expect(body.plain_english).toBe('Show me open leads');
    expect(body.compiled_ir).toBeTruthy();

    // localStorage was never written
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });

  // ── 4. 409 duplicate name shows toast error ─────────────────────────────────

  it('shows error toast when report name already exists (409)', async () => {
    const { toast } = await import('react-hot-toast');

    mockFetch([
      [
        `${BACKEND}/api/pep/compile`,
        {
          POST: () => ({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'success',
                data: {
                  ir: SAVED_REPORT.compiled_ir,
                  confirmation: 'Showing leads',
                  braid_ir: {},
                  semantic_frame: {},
                  plan: {},
                  audit: {},
                  target: 'leads',
                  target_kind: 'entity',
                },
              }),
          }),
        },
      ],
      [
        `${BACKEND}/api/pep/query`,
        {
          POST: () => ({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'success',
                data: {
                  rows: [],
                  count: 0,
                  target: 'leads',
                  target_kind: 'entity',
                  executed_at: new Date().toISOString(),
                },
              }),
          }),
        },
      ],
      [
        `${BACKEND}/api/pep/saved-reports`,
        {
          POST: () => ({
            ok: false,
            json: () =>
              Promise.resolve({
                status: 'error',
                message:
                  'A report named "Open Leads" already exists. Please choose a different name.',
              }),
          }),
          GET: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success', data: [] }),
          }),
        },
      ],
    ]);

    renderCustomQuery();

    const textarea = screen.getByPlaceholderText(/Ask a question/i);
    fireEvent.change(textarea, { target: { value: 'Show me open leads' } });
    fireEvent.click(screen.getByRole('button', { name: /Run/i }));

    await waitFor(() => expect(screen.getByText(/Save Report/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Save Report/i));
    fireEvent.change(screen.getByPlaceholderText(/Report name/i), {
      target: { value: 'Open Leads' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    });
  });

  // ── 5. Delete calls DELETE /api/pep/saved-reports/:id ──────────────────────

  it('calls DELETE endpoint when a saved report is deleted', async () => {
    const deleteSpy = vi.fn(() => ({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
    }));

    mockFetch([
      [
        `${BACKEND}/api/pep/saved-reports`,
        {
          GET: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success', data: [SAVED_REPORT] }),
          }),
          DELETE: deleteSpy,
        },
      ],
    ]);

    renderCustomQuery();
    fireEvent.click(screen.getByText(/Saved Reports/i));

    await waitFor(() => expect(screen.getByText('Open Leads')).toBeInTheDocument());

    // Click the trash icon in the "Open Leads" card
    const openLeadsText = screen.getByText('Open Leads');
    const reportCard = openLeadsText.closest('div.flex');
    const buttons = within(reportCard).getAllByRole('button');
    const deleteBtn = buttons[buttons.length - 1]; // Trash is the last button
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      const deleteCall = globalThis.fetch.mock.calls.find(
        ([url, opts]) =>
          url.includes(`saved-reports/${SAVED_REPORT.id}`) && opts?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
    });

    // localStorage was not touched
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });

  // ── 6. Running a saved report fires PATCH .../run ───────────────────────────

  it('calls PATCH .../run when a saved report is executed', async () => {
    mockFetch([
      [
        `${BACKEND}/api/pep/saved-reports`,
        {
          GET: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success', data: [SAVED_REPORT] }),
          }),
        },
      ],
      [
        `${BACKEND}/api/pep/query`,
        {
          POST: () => ({
            ok: true,
            json: () =>
              Promise.resolve({
                status: 'success',
                data: {
                  rows: [],
                  count: 0,
                  target: 'leads',
                  target_kind: 'entity',
                  executed_at: new Date().toISOString(),
                },
              }),
          }),
        },
      ],
      [
        /saved-reports\/.*\/run/,
        {
          PATCH: () => ({
            ok: true,
            json: () => Promise.resolve({ status: 'success' }),
          }),
        },
      ],
    ]);

    renderCustomQuery();
    fireEvent.click(screen.getByText(/Saved Reports/i));

    await waitFor(() => expect(screen.getByText('Open Leads')).toBeInTheDocument());

    // There are two "Run" buttons (saved report + main query bar) — scope to the saved reports panel
    const savedReportsPanel = screen.getByText('Open Leads').closest('.space-y-2');
    const runBtn = within(savedReportsPanel).getByRole('button', { name: /^Run$/ });
    fireEvent.click(runBtn);

    await waitFor(() => {
      const patchCall = globalThis.fetch.mock.calls.find(
        ([url, opts]) =>
          url.includes(`saved-reports/${SAVED_REPORT.id}/run`) && opts?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(patchCall[1].body);
      expect(body.tenant_id).toBe(TENANT_ID);
    });
  });
});
