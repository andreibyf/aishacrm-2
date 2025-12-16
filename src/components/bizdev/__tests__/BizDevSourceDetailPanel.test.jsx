import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { withAct } from '@/test/uiActHelpers';
import { BrowserRouter } from 'react-router-dom';
import BizDevSourceDetailPanel from '../BizDevSourceDetailPanel.jsx';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock toast to avoid console noise
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock useTenant hook
vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: 'tenant-abc' })
}));

// Mock entities used by the panel (list-only; promote handled by parent callback now)
const listLeadsMock = vi.fn();
const listOppsMock = vi.fn();
const getTenantMock = vi.fn().mockResolvedValue({ id: 'tenant-abc', business_model: 'b2b' });
vi.mock('@/api/entities', () => ({
  BizDevSource: { promote: vi.fn() },
  Lead: { list: (...args) => listLeadsMock(...args) },
  Opportunity: { list: (...args) => listOppsMock(...args), create: vi.fn() },
  Activity: { create: vi.fn() },
  Tenant: { get: (...args) => getTenantMock(...args) },
}));

// Wrap component with Router since it uses Link internally
function renderWithRouter(ui) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('BizDevSourceDetailPanel - Promote Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLeadsMock.mockResolvedValue([]);
    listOppsMock.mockResolvedValue([]);
  });

  it('promotes an Active source to Lead and updates status', async () => {
    const source = {
      id: 'src-123',
      company_name: 'Acme Construction',
      status: 'Active',
      tenant_id: 'tenant-abc',
      email: 'info@acme.com',
      phone_number: '555-1234',
    };

    const promotedLead = { id: 'lead-999', first_name: 'Acme', last_name: 'Construction' };

  const onUpdate = vi.fn();
    const onPromote = vi.fn().mockResolvedValue({ lead: promotedLead });
    const onRefresh = vi.fn();

    renderWithRouter(
      <BizDevSourceDetailPanel
        bizDevSource={source}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onPromote={onPromote}
        onUpdate={onUpdate}
        onRefresh={onRefresh}
      />
    );

    // Verify promotion button is visible
    expect(screen.getByRole('button', { name: /Promote to Lead/i })).toBeInTheDocument();

    // Click promote button → shows confirmation
    await withAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Promote to Lead/i }));
    });

    // Confirm dialog appears
    await waitFor(() => expect(screen.getByText(/Promote to Lead\?/i)).toBeInTheDocument());

    // Click confirm
    await withAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Promotion/i }));
    });

  // Verify parent onPromote callback was called
  await waitFor(() => expect(onPromote).toHaveBeenCalled());

    // Callbacks invoked with updated source (status: Promoted, account_id set)
    expect(onUpdate).toHaveBeenCalled();
    const updatedSource = onUpdate.mock.calls[0][0];
    expect(updatedSource.status).toBe('Promoted');
    expect(updatedSource.metadata.primary_lead_id).toBe('lead-999');

    // Panel delegates promotion to parent; ensure it was invoked (status update verified via onUpdate).
    expect(onPromote).toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();

    // UI should show 'Already Promoted' alert after state updates
    await waitFor(() => expect(screen.getByText(/Already Promoted/i)).toBeInTheDocument());
    expect(screen.getAllByText(/Acme Construction/).length).toBeGreaterThanOrEqual(2); // Header + alert
  });

  it('treats legacy "converted" status as promoted', async () => {
    const legacySource = {
      id: 'src-old',
      company_name: 'Legacy Corp',
      status: 'converted', // legacy status
      tenant_id: 'tenant-abc',
      account_id: 'acc-legacy',
      account_name: 'Legacy Corp',
    };

    renderWithRouter(
      <BizDevSourceDetailPanel
        bizDevSource={legacySource}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onPromote={vi.fn()}
        onUpdate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // Promote button should NOT be visible (already promoted)
    expect(screen.queryByRole('button', { name: /Promote to Lead/i })).not.toBeInTheDocument();

    // Should show 'Already Promoted' alert
    expect(screen.getByText(/Already Promoted/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Legacy Corp/).length).toBeGreaterThanOrEqual(2); // Header + alert

    // Should show 'View Account' button
    expect(screen.getByRole('link', { name: /View Lead/i })).toBeInTheDocument();
  });

  it('shows error toast when promote API fails', async () => {
    const { toast } = await import('sonner');
    const source = {
      id: 'src-bad',
      company_name: 'Bad Corp',
      status: 'Active',
      tenant_id: 'tenant-abc',
    };

  const onPromote = vi.fn().mockRejectedValue(new Error('Network error'));

    renderWithRouter(
      <BizDevSourceDetailPanel
        bizDevSource={source}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onPromote={onPromote}
        onUpdate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    await withAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Promote to Lead/i }));
    });
    await waitFor(() => expect(screen.getByText(/Promote to Lead\?/i)).toBeInTheDocument());

    await withAct(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Promotion/i }));
    });

  await waitFor(() => expect(onPromote).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Network error|Failed to promote/i));
  });

  it('displays linked lead information when already promoted', async () => {
    const promotedSource = {
      id: 'src-promoted',
      company_name: 'Promoted Inc',
      status: 'Promoted',
      tenant_id: 'tenant-abc',
      metadata: { primary_lead_id: 'lead-promoted' },
    };

    renderWithRouter(
      <BizDevSourceDetailPanel
        bizDevSource={promotedSource}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onPromote={vi.fn()}
        onUpdate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // No promote button
    expect(screen.queryByRole('button', { name: /Promote to Lead/i })).not.toBeInTheDocument();

    // 'View Linked Lead' button visible in header actions
    const viewLeadButton = screen.getByRole('link', { name: /View Linked Lead/i });
    expect(viewLeadButton).toBeInTheDocument();
    expect(viewLeadButton).toHaveAttribute('href', expect.stringContaining('lead-promoted'));

    // 'Already Promoted' alert visible
    expect(screen.getByText(/Already Promoted/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Promoted Inc/).length).toBeGreaterThan(0); // Header and/or alert present
  });

  it('does not show promote button for archived sources', async () => {
    const archivedSource = {
      id: 'src-archived',
      company_name: 'Archived Co',
      status: 'Archived',
      tenant_id: 'tenant-abc',
      archived_at: '2025-01-01T00:00:00Z',
    };

    renderWithRouter(
      <BizDevSourceDetailPanel
        bizDevSource={archivedSource}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onPromote={vi.fn()}
        onUpdate={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // No promote button for archived
    expect(screen.queryByRole('button', { name: /Promote to Lead/i })).not.toBeInTheDocument();

    // Edit/Archive buttons should also be hidden
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archive/i })).not.toBeInTheDocument();
  });
});
