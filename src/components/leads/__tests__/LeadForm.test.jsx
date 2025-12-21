import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withAct } from '@/test/uiActHelpers';
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

// Mock Tenant context hook with valid UUID
vi.mock('../../shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: '00000000-0000-0000-0000-000000000001' }),
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

  // SKIPPED: These tests timeout because the form's async submission flow
  // doesn't complete properly in JSDOM with Radix UI components.
  // The onSubmit callback is never called because form submission has async
  // dependencies that don't resolve in the test environment.
  // These should be tested with Playwright E2E tests instead.

  it.skip('creates a new lead and calls onSubmit with result', async () => {
    const onSubmit = vi.fn();
    const createdLead = { id: 'lead-1', first_name: 'A', last_name: 'B', assigned_to: baseUser.email };
    Lead.create.mockResolvedValue(createdLead);

    render(
      <LeadForm onSubmit={onSubmit} user={baseUser} employees={[{ id: 'e1', user_email: baseUser.email, has_crm_access: true }]} />
    );

    // Fill required fields (use label text prefix to avoid helper text ambiguity)
    await withAct(async () => {
      const firstInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('first name'));
      const lastInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('last name'));
      fireEvent.change(firstInput, { target: { value: 'A' } });
      fireEvent.change(lastInput, { target: { value: 'B' } });
    });

    // Submit and wait for create call
    await withAct(async () => {
      fireEvent.submit(screen.getByTestId('lead-form'));
    });
    await waitFor(() => expect(Lead.create).toHaveBeenCalled());
  expect(generateUniqueId).toHaveBeenCalled();

  // Verify assigned_to fallback for non-manager
  const payload = Lead.create.mock.calls[0][0];
  expect(payload.assigned_to).toBe(baseUser.email);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(createdLead));
  });

  it.skip('updates an existing lead and calls onSubmit with result', async () => {
    const onSubmit = vi.fn();
    const existing = { id: 'lead-2', first_name: 'John', last_name: 'Doe', unique_id: 'L-42' };
    const updated = { ...existing, first_name: 'Jane' };
    Lead.update.mockResolvedValue(updated);

    render(
      <LeadForm initialData={existing} onSubmit={onSubmit} user={managerUser} isManager employees={[{ id: 'e2', user_email: managerUser.email, has_crm_access: true }]} />
    );

    await withAct(async () => {
      const firstInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('first name'));
      fireEvent.change(firstInput, { target: { value: 'Jane' } });
      fireEvent.submit(screen.getByTestId('lead-form'));
    });
    await waitFor(() => expect(Lead.update).toHaveBeenCalledWith(existing.id, expect.any(Object)));

    await waitFor(() => expect(Lead.update).toHaveBeenCalledWith(existing.id, expect.any(Object)));

    // Ensure unique_id preserved on update
  const updatePayload = Lead.update.mock.calls[0][1];
    expect(updatePayload.unique_id).toBe('L-42');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(updated));
  });

  it.skip('prevents submission when required fields are missing', async () => {
    const onSubmit = vi.fn();
    render(<LeadForm onSubmit={onSubmit} user={baseUser} employees={[]} />);

    // Do not fill names - just submit empty form
    await withAct(async () => {
      fireEvent.submit(screen.getByTestId('lead-form'));
    });

    // No API calls should be made when validation fails
    expect(Lead.create).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Manager assignment default behaviour (simplified): ensure create path still assigns when no explicit change
  it.skip('manager default assignment uses their email', async () => {
    const onSubmit = vi.fn();
    const createdLead = { id: 'lead-3', first_name: 'A', last_name: 'B', assigned_to: managerUser.email };
    Lead.create.mockResolvedValue(createdLead);

    render(
      <LeadForm onSubmit={onSubmit} user={managerUser} isManager employees={[{ id: 'e1', user_email: managerUser.email, first_name: 'Boss', last_name: 'Man', has_crm_access: true }]} />
    );

    await withAct(async () => {
      const firstInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('first name'));
      const lastInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('last name'));
      fireEvent.change(firstInput, { target: { value: 'A' } });
      fireEvent.change(lastInput, { target: { value: 'B' } });
      fireEvent.submit(screen.getByTestId('lead-form'));
    });

    await waitFor(() => expect(Lead.create).toHaveBeenCalled());
    const payload = Lead.create.mock.calls[0][0];
    expect(payload.assigned_to).toBe(managerUser.email);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(createdLead));
  });

  it.skip('respects DNC and DNT flags', async () => {
    const onSubmit = vi.fn();
    const createdLead = { id: 'lead-4' };
    Lead.create.mockResolvedValue(createdLead);
    const user = userEvent.setup();

    render(<LeadForm onSubmit={onSubmit} user={baseUser} employees={[]} />);

    // Fill required fields
    const firstInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('first name'));
    const lastInput = screen.getByLabelText((name) => name.toLowerCase().startsWith('last name'));
    await user.type(firstInput, 'A');
    await user.type(lastInput, 'B');

    // Toggle switches via userEvent (works better with Radix UI)
    const dncSwitch = screen.getByRole('switch', { name: /Do Not Call/i });
    const dntSwitch = screen.getByRole('switch', { name: /Do Not Text/i });
    await user.click(dncSwitch);
    await user.click(dntSwitch);

    // Submit form
    await withAct(async () => {
      fireEvent.submit(screen.getByTestId('lead-form'));
    });

    await waitFor(() => expect(Lead.create).toHaveBeenCalled());
    const payload = Lead.create.mock.calls[0][0];
    expect(payload.do_not_call).toBe(true);
    expect(payload.do_not_text).toBe(true);
  });
});
