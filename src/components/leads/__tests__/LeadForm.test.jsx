import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeadForm from '../LeadForm.jsx';

// Mock aliases
vi.mock('@/api/entities', () => {
  return {
    Lead: {
      create: vi.fn(),
      update: vi.fn(),
      filter: vi.fn(),
    },
    Account: {
      filter: vi.fn().mockResolvedValue([]),
    },
    Contact: {
      filter: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('@/api/functions', () => ({
  generateUniqueId: vi.fn().mockResolvedValue({ data: { unique_id: 'L-TEST-001' } }),
}));

// Mock Tenant context hook
vi.mock('../../shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: 'tenant-1' }),
}));

// Mock useApiManager to avoid real fetching
vi.mock('../../shared/ApiManager', () => ({
  useApiManager: () => ({
    cachedRequest: vi.fn(() => Promise.resolve([])),
  }),
}));

// Mock child components with minimal implementations
vi.mock('../../shared/LazyAccountSelector', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <input aria-label="account-selector" value={value || ''} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../../shared/PhoneInput', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <input aria-label="phone-input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../../shared/AddressFields', () => ({
  __esModule: true,
  default: ({ formData, handleChange }) => (
    <div>
      <input aria-label="address-1" value={formData.address_1 || ''} onChange={(e) => handleChange('address_1', e.target.value)} />
    </div>
  ),
}));

vi.mock('../../shared/TagInput', () => ({
  __esModule: true,
  default: ({ selectedTags, onTagsChange }) => (
    <input aria-label="tag-input" value={(selectedTags || []).join(',')} onChange={(e) => onTagsChange(e.target.value.split(',').filter(Boolean))} />
  ),
}));

// UI shadcn components are fine to render; keep defaults

const { Lead } = await import('@/api/entities');
const { generateUniqueId } = await import('@/api/functions');

// Provide a simple ResizeObserver stub required by Radix UI components in JSDOM
beforeAll(() => {
  if (!(globalThis).ResizeObserver) {
    (globalThis).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('LeadForm - Unified Submission Pattern', () => {
  const baseUser = { email: 'rep@example.com', role: 'employee', tenant_id: 'tenant-1' };
  const managerUser = { email: 'manager@example.com', role: 'manager', tenant_id: 'tenant-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new lead and calls onSubmit with result', async () => {
    const onSubmit = vi.fn();
    const createdLead = { id: 'lead-1', first_name: 'A', last_name: 'B', assigned_to: baseUser.email };
    Lead.create.mockResolvedValue(createdLead);

    render(
      <LeadForm onSubmit={onSubmit} user={baseUser} employees={[{ id: 'e1', user_email: baseUser.email, has_crm_access: true }]} />
    );

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'B' } });

    // Submit
    fireEvent.submit(screen.getByTestId('lead-form'));

  await waitFor(() => expect(Lead.create).toHaveBeenCalled());
  expect(generateUniqueId).toHaveBeenCalled();

  // Verify assigned_to fallback for non-manager
  const payload = Lead.create.mock.calls[0][0];
  expect(payload.assigned_to).toBe(baseUser.email);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(createdLead));
  });

  it('updates an existing lead and calls onSubmit with result', async () => {
    const onSubmit = vi.fn();
    const existing = { id: 'lead-2', first_name: 'John', last_name: 'Doe', unique_id: 'L-42' };
    const updated = { ...existing, first_name: 'Jane' };
    Lead.update.mockResolvedValue(updated);

    render(
      <LeadForm initialData={existing} onSubmit={onSubmit} user={managerUser} isManager employees={[{ id: 'e2', user_email: managerUser.email, has_crm_access: true }]} />
    );

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
    fireEvent.submit(screen.getByTestId('lead-form'));

    await waitFor(() => expect(Lead.update).toHaveBeenCalledWith(existing.id, expect.any(Object)));

    // Ensure unique_id preserved on update
  const updatePayload = Lead.update.mock.calls[0][1];
    expect(updatePayload.unique_id).toBe('L-42');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(updated));
  });

  it('prevents submission when required fields are missing', async () => {
    const onSubmit = vi.fn();
    render(<LeadForm onSubmit={onSubmit} user={baseUser} employees={[]} />);

    // Do not fill names
    fireEvent.submit(screen.getByTestId('lead-form'));

    // No API calls
    expect(Lead.create).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    // Show accessible errors
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  // Manager assignment default behaviour (simplified): ensure create path still assigns when no explicit change
  it('manager default assignment uses their email', async () => {
    const onSubmit = vi.fn();
    const createdLead = { id: 'lead-3', first_name: 'A', last_name: 'B', assigned_to: managerUser.email };
    Lead.create.mockResolvedValue(createdLead);

    render(
      <LeadForm onSubmit={onSubmit} user={managerUser} isManager employees={[{ id: 'e1', user_email: managerUser.email, first_name: 'Boss', last_name: 'Man', has_crm_access: true }]} />
    );

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'B' } });
    fireEvent.submit(screen.getByTestId('lead-form'));

    await waitFor(() => expect(Lead.create).toHaveBeenCalled());
    const payload = Lead.create.mock.calls[0][0];
    expect(payload.assigned_to).toBe(managerUser.email);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(createdLead));
  });

  it('respects DNC and DNT flags', async () => {
    const onSubmit = vi.fn();
    const createdLead = { id: 'lead-4' };
    Lead.create.mockResolvedValue(createdLead);

    render(<LeadForm onSubmit={onSubmit} user={baseUser} employees={[]} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'B' } });

    // Toggle switches by clicking labels (Switch is a controlled component)
    fireEvent.click(screen.getByLabelText(/Do Not Call/i));
    fireEvent.click(screen.getByLabelText(/Do Not Text/i));

    fireEvent.submit(screen.getByTestId('lead-form'));

    await waitFor(() => expect(Lead.create).toHaveBeenCalled());
    const payload = Lead.create.mock.calls[0][0];
    expect(payload.do_not_call).toBe(true);
    expect(payload.do_not_text).toBe(true);
  });
});
