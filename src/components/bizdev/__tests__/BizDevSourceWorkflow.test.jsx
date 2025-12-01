import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { withAct } from '@/test/uiActHelpers';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import BizDevSourceForm from '../BizDevSourceForm';
import BizDevSourceDetailPanel from '../BizDevSourceDetailPanel';
import { BizDevSource } from '@/api/entities';

// Mock the API entities
vi.mock('@/api/entities', () => ({
  BizDevSource: {
    create: vi.fn(),
    update: vi.fn(),
    promote: vi.fn(),
  },
  Opportunity: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
  Activity: {
    filter: vi.fn().mockResolvedValue([]),
  },
  Lead: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
  User: {
    me: vi.fn(),
  },
  Employee: {
    filter: vi.fn(),
  },
}));

// Mock useEntityForm to provide tenant id and disable submitting state
vi.mock('@/hooks/useEntityForm', () => ({
  useEntityForm: () => ({
    ensureTenantId: vi.fn().mockResolvedValue('test-tenant-123'),
    isSubmitting: false,
    normalizeError: (e) => (e?.message ?? String(e)),
  }),
}));

// Mock tenant context
vi.mock('../../shared/tenantContext', () => ({
  useTenant: () => ({
    selectedTenantId: 'test-tenant-123',
  }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: vi.fn((date) => new Date(date).toLocaleDateString()),
}));

describe('BizDevSource Complete Workflow Integration Tests', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    tenant_id: 'test-tenant-123',
    role: 'user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create BizDev Source Flow', () => {
    it('should create a BizDev source with required fields', async () => {
      const user = userEvent.setup();

      const createdSource = {
        id: 'source-123',
        company_name: 'Acme Corp',
        source: 'Web Research',
        email: 'contact@acme.com',
        phone_number: '555-0100',
        status: 'Active',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      BizDevSource.create.mockResolvedValueOnce(createdSource);

      const mockOnSubmit = vi.fn();
      const mockOnCancel = vi.fn();

      render(
        <BrowserRouter>
          <BizDevSourceForm
            onSubmit={mockOnSubmit}
            onCancel={mockOnCancel}
            user={mockUser}
          />
        </BrowserRouter>
      );

      // Fill out the required fields
      await user.type(screen.getByLabelText(/company name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/^source/i), 'Web Research');
      await user.type(screen.getByLabelText(/email/i), 'contact@acme.com');
      await user.type(screen.getByLabelText(/phone number/i), '555-0100');

  // Submit the form
  const submitButton = screen.getByRole('button', { name: /create source/i });
      await withAct(async () => {
        await user.click(submitButton);
      });

      // Verify source was created with correct data
      await waitFor(() => {
        expect(BizDevSource.create).toHaveBeenCalledWith(
          expect.objectContaining({
            company_name: 'Acme Corp',
            source_name: 'Web Research',
            email: 'contact@acme.com',
            phone_number: '555-0100',
            tenant_id: 'test-tenant-123',
          })
        );
      });

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(createdSource);
      });
    });

    it('should accept optional address and notes fields', async () => {
      const user = userEvent.setup();

      const createdSource = {
        id: 'source-full',
        company_name: 'Full Data Corp',
        source: 'Directory',
        email: 'info@fulldata.com',
        address_line_1: '123 Main St',
        city: 'Seattle',
        state: 'WA',
        zip_code: '98101',
        notes: 'High priority lead',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      BizDevSource.create.mockResolvedValueOnce(createdSource);

      render(
        <BrowserRouter>
          <BizDevSourceForm
            onSubmit={vi.fn()}
            onCancel={vi.fn()}
            user={mockUser}
          />
        </BrowserRouter>
      );

      // Fill out required and optional fields
      await user.type(screen.getByLabelText(/company name/i), 'Full Data Corp');
      await user.type(screen.getByLabelText(/^source/i), 'Directory');
      await user.type(screen.getByLabelText(/email/i), 'info@fulldata.com');
      await user.type(screen.getByLabelText(/address line 1/i), '123 Main St');
      await user.type(screen.getByLabelText(/city/i), 'Seattle');
  await user.type(screen.getByLabelText(/state\/province/i), 'WA');
  await user.type(screen.getByLabelText(/postal code/i), '98101');
      await user.type(screen.getByLabelText(/notes/i), 'High priority lead');

  const submitButton = screen.getByRole('button', { name: /create source/i });
      await withAct(async () => {
        await user.click(submitButton);
      });

      await waitFor(() => {
        expect(BizDevSource.create).toHaveBeenCalledWith(
          expect.objectContaining({
            company_name: 'Full Data Corp',
            source_name: 'Directory',
            email: 'info@fulldata.com',
            address_line_1: '123 Main St',
            city: 'Seattle',
            state_province: 'WA',
            postal_code: '98101',
            notes: 'High priority lead',
          })
        );
      });
    });

    it('should require company name and source fields', async () => {
      const mockOnSubmit = vi.fn();
      const mockOnCancel = vi.fn();

      render(
        <BrowserRouter>
          <BizDevSourceForm
            onSubmit={mockOnSubmit}
            onCancel={mockOnCancel}
            user={mockUser}
          />
        </BrowserRouter>
      );

      // Try to submit without filling required fields
  const submitButton = screen.getByRole('button', { name: /create source/i });
      await withAct(async () => {
        await userEvent.click(submitButton);
      });

      // Form should not be submitted (browser validation prevents it)
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('BizDev Source Detail Panel Display', () => {
    it('should show promote button for Active sources', async () => {
      const activeSource = {
        id: 'source-789',
        company_name: 'Beta Industries',
        status: 'Active',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      render(
        <BrowserRouter>
          <BizDevSourceDetailPanel
            bizDevSource={activeSource}
            onClose={() => {}}
            onEdit={() => {}}
            onPromote={() => {}}
            onUpdate={() => {}}
            onRefresh={() => {}}
          />
        </BrowserRouter>
      );

      // Verify the source name is displayed
      expect(screen.getAllByText('Beta Industries').length).toBeGreaterThan(0);
      
      // The promote button should be visible for Active status
      await waitFor(() => {
        const promoteButton = screen.queryByRole('button', { name: /promote to account/i });
        expect(promoteButton).toBeInTheDocument();
      });
    });

    it('should show promoted badge for Promoted sources', async () => {
      const promotedSource = {
        id: 'source-555',
        company_name: 'Gamma LLC',
        status: 'Promoted',
        account_id: 'account-999',
        account_name: 'Gamma LLC',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      render(
        <BrowserRouter>
          <BizDevSourceDetailPanel
            bizDevSource={promotedSource}
            onClose={() => {}}
            onEdit={() => {}}
            onPromote={() => {}}
            onUpdate={() => {}}
            onRefresh={() => {}}
          />
        </BrowserRouter>
      );

      // Should show promoted badge (multiple matches may exist)
      await waitFor(() => {
        expect(screen.getAllByText(/promoted/i).length).toBeGreaterThan(0);
      });
    });

    it('should not show promote button for Archived sources', async () => {
      const archivedSource = {
        id: 'source-archived',
        company_name: 'Archived Corp',
        status: 'Archived',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      render(
        <BrowserRouter>
          <BizDevSourceDetailPanel
            bizDevSource={archivedSource}
            onClose={() => {}}
            onEdit={() => {}}
            onPromote={() => {}}
            onUpdate={() => {}}
            onRefresh={() => {}}
          />
        </BrowserRouter>
      );

      // Promote button should not be visible for archived sources
      const promoteButton = screen.queryByRole('button', { name: /promote to account/i });
      expect(promoteButton).not.toBeInTheDocument();
    });

    it('should handle backward compatibility with legacy converted status', async () => {
      const legacyConvertedSource = {
        id: 'source-legacy',
        company_name: 'Legacy Corp',
        status: 'converted', // Legacy status from Base44 migration
        account_id: 'account-legacy',
        account_name: 'Legacy Corp',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      render(
        <BrowserRouter>
          <BizDevSourceDetailPanel
            bizDevSource={legacyConvertedSource}
            onClose={() => {}}
            onEdit={() => {}}
            onPromote={() => {}}
            onUpdate={() => {}}
            onRefresh={() => {}}
          />
        </BrowserRouter>
      );

  // Should display the source name (may appear in multiple places)
  expect(screen.getAllByText('Legacy Corp').length).toBeGreaterThan(0);
      
      // Promote button should not be shown for legacy converted status
      const promoteButton = screen.queryByRole('button', { name: /promote to account/i });
      expect(promoteButton).not.toBeInTheDocument();
    });
  });

  describe('Integration with Other Entities', () => {
    it('should render detail panel for sources with linked opportunities', async () => {
      const sourceWithOpportunity = {
        id: 'source-with-opp',
        company_name: 'Opportunity Test Corp',
        status: 'Active',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      render(
        <BrowserRouter>
          <BizDevSourceDetailPanel
            bizDevSource={sourceWithOpportunity}
            onClose={() => {}}
            onEdit={() => {}}
            onPromote={() => {}}
            onUpdate={() => {}}
            onRefresh={() => {}}
          />
        </BrowserRouter>
      );

      expect(screen.getAllByText('Opportunity Test Corp').length).toBeGreaterThan(0);
    });

    it('should render detail panel for sources with linked leads', async () => {
      const sourceWithLead = {
        id: 'source-with-lead',
        company_name: 'Lead Test Corp',
        status: 'Active',
        tenant_id: 'test-tenant-123',
        created_at: new Date().toISOString(),
      };

      render(
        <BrowserRouter>
          <BizDevSourceDetailPanel
            bizDevSource={sourceWithLead}
            onClose={() => {}}
            onEdit={() => {}}
            onPromote={() => {}}
            onUpdate={() => {}}
            onRefresh={() => {}}
          />
        </BrowserRouter>
      );

      expect(screen.getAllByText('Lead Test Corp').length).toBeGreaterThan(0);
    });
  });
});
