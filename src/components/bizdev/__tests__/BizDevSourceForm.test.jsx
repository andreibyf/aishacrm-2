import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BizDevSourceForm from '../BizDevSourceForm.jsx';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock toast to avoid noisy console and to assert errors
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Provide a mutable mock for ensureTenantId so tests can override per-case
const ensureTenantIdMock = vi.fn().mockResolvedValue('tenant-123');
vi.mock('@/hooks/useEntityForm', () => ({
  useEntityForm: () => ({
    ensureTenantId: ensureTenantIdMock,
    isSubmitting: false,
    normalizeError: (e) => e?.message || 'Error'
  })
}));

// Mock entities used by the form
const createMock = vi.fn();
const updateMock = vi.fn();
const filterLeadsMock = vi.fn();
vi.mock('@/api/entities', () => ({
  BizDevSource: { create: (...args) => createMock(...args), update: (...args) => updateMock(...args) },
  Lead: { filter: (...args) => filterLeadsMock(...args) },
}));

function fillBasicFields() {
  fireEvent.change(screen.getByLabelText(/Source/i), { target: { value: 'Directory Q4' } });
  fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: 'Acme Corp' } });
}

describe('BizDevSourceForm - Unified Submission Pattern', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset tenant resolver default and lead list mock per test
    ensureTenantIdMock.mockResolvedValue('tenant-123');
    filterLeadsMock.mockResolvedValue([]);
  });

  it('creates a new source and calls onSubmit with result', async () => {
    const onSubmit = vi.fn();
    const result = { id: 'src-1', company_name: 'Acme Corp' };
    createMock.mockResolvedValue(result);

    render(<BizDevSourceForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fillBasicFields();

    fireEvent.click(screen.getByRole('button', { name: /Create Source/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      tenant_id: 'tenant-123',
      source: 'Directory Q4',
      company_name: 'Acme Corp'
    }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(result));
  });

  it('updates an existing source and calls onSubmit with result', async () => {
    const onSubmit = vi.fn();
    const existing = { id: 'src-99', source: 'List A', company_name: 'Beta LLC', tenant_id: 'tenant-123' };
    const updated = { ...existing, company_name: 'Beta Limited' };
    updateMock.mockResolvedValue(updated);

    render(<BizDevSourceForm initialData={existing} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: 'Beta Limited' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Source/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(existing.id, expect.objectContaining({
      tenant_id: 'tenant-123',
      company_name: 'Beta Limited'
    })));

    expect(onSubmit).toHaveBeenCalledWith(updated);
  });

  it('shows validation error when Source is missing', async () => {
    const { toast } = await import('sonner');
    const onSubmit = vi.fn();

    const { container } = render(<BizDevSourceForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    // Intentionally fill only Company Name
    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: 'Acme Corp' } });

    // Disable native validation blocking and submit the form programmatically
    const form = container.querySelector('form');
    form?.setAttribute('novalidate', '');
    fireEvent.submit(form);

    // Should not call create/update
    await waitFor(() => expect(createMock).not.toHaveBeenCalled());
    expect(updateMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('aborts submit when tenant is unavailable', async () => {
    const { toast } = await import('sonner');

    // Make tenant resolver return null for this test (for all calls)
    ensureTenantIdMock.mockResolvedValue(null);

    const onSubmit = vi.fn();
    render(<BizDevSourceForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fillBasicFields();
    fireEvent.click(screen.getByRole('button', { name: /Create Source/i }));

    await waitFor(() => expect(createMock).not.toHaveBeenCalled());
    expect(updateMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/tenant/i));
  });

  it('converts empty strings to null in payload', async () => {
    const onSubmit = vi.fn();
    createMock.mockResolvedValue({ id: 'src-2' });

    render(<BizDevSourceForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fillBasicFields();
    // leave DBA Name empty and submit
    fireEvent.click(screen.getByRole('button', { name: /Create Source/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const payload = createMock.mock.calls[0][0];
    expect(payload.dba_name).toBeNull();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<BizDevSourceForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
