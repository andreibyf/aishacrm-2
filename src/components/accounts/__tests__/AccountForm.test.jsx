import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import AccountForm from '../AccountForm';
import { User, Account } from '@/api/entities';
import { generateUniqueId } from '@/api/functions';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/entities', () => ({
  User: {
    me: vi.fn(),
  },
  Account: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/api/functions', () => ({
  generateUniqueId: vi.fn(),
}));

vi.mock('../../shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: null }),
}));

vi.mock('../../shared/tenantUtils', () => ({
  isValidId: vi.fn(() => true),
}));

vi.mock('../../shared/PhoneInput', () => ({
  default: ({ onChange, value }) => (
    <input data-testid="phone-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../../shared/AddressFields', () => ({
  default: ({ handleChange }) => (
    <div data-testid="address-fields">
      <input data-testid="city-input" onChange={(e) => handleChange('city', e.target.value)} />
    </div>
  ),
}));

vi.mock('../../shared/EmployeeSelector', () => ({
  default: ({ onValueChange, value }) => (
    <select data-testid="employee-selector" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Select</option>
      <option value="user@example.com">User</option>
    </select>
  ),
}));

describe('AccountForm - Unified Submission Pattern', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();
  const mockUser = {
    email: 'user@example.com',
    tenant_id: 'tenant-123',
    role: 'employee',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    User.me.mockResolvedValue(mockUser);
    generateUniqueId.mockResolvedValue({ data: { unique_id: 'ACC-001' } });
  });

  it('should render form with empty fields for new account', async () => {
    render(
      <AccountForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Account Name/i)).toHaveValue('');
    expect(screen.getByText('Create Account')).toBeInTheDocument();
  });

  it('should render form with prefilled fields for existing account (legacy prop)', async () => {
    const account = {
      id: 'acc-1',
      name: 'Acme Corp',
      type: 'customer',
      industry: 'construction',
      email: 'contact@acme.com',
      annual_revenue: 1000000,
      employee_count: 50,
    };

    render(
      <AccountForm
        account={account}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toHaveValue('Acme Corp');
    });

    expect(screen.getByLabelText(/Email/i)).toHaveValue('contact@acme.com');
    expect(screen.getByText('Update Account')).toBeInTheDocument();
  });

  it('should render form with prefilled fields using new initialData prop', async () => {
    const initialData = {
      id: 'acc-2',
      name: 'Tech Solutions Inc',
      type: 'prospect',
      email: 'info@techsolutions.com',
    };

    render(
      <AccountForm
        initialData={initialData}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toHaveValue('Tech Solutions Inc');
    });

    expect(screen.getByLabelText(/Email/i)).toHaveValue('info@techsolutions.com');
  });

  it('should create new account with sanitized numeric fields', async () => {
    const createdAccount = {
      id: 'acc-new',
      name: 'New Company',
      email: 'new@company.com',
      annual_revenue: 500000,
      employee_count: 25,
      tenant_id: 'tenant-123',
      unique_id: 'ACC-001',
    };

    Account.create.mockResolvedValueOnce(createdAccount);

    render(
      <AccountForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toBeInTheDocument();
    });

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/Account Name/i), {
      target: { value: 'New Company' },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'new@company.com' },
    });
    fireEvent.change(screen.getByLabelText(/Annual Revenue/i), {
      target: { value: '500000' },
    });
    fireEvent.change(screen.getByLabelText(/Employees/i), {
      target: { value: '25' },
    });

    const submitButton = screen.getByText('Create Account');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(generateUniqueId).toHaveBeenCalledWith({
        entity_type: 'Account',
        tenant_id: 'tenant-123',
      });
    });

    await waitFor(() => {
      expect(Account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Company',
          email: 'new@company.com',
          annual_revenue: 500000, // Sanitized to number
          employee_count: 25, // Sanitized to number
          tenant_id: 'tenant-123',
          unique_id: 'ACC-001',
        })
      );
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Account created successfully');
    });

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(createdAccount);
    });
  });

  it('should update existing account', async () => {
    const existingAccount = {
      id: 'acc-1',
      name: 'Existing Corp',
      email: 'existing@corp.com',
      type: 'customer',
      annual_revenue: 2000000,
    };

    const updatedAccount = {
      ...existingAccount,
      annual_revenue: 2500000,
    };

    Account.update.mockResolvedValueOnce(updatedAccount);

    render(
      <AccountForm
        initialData={existingAccount}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toHaveValue('Existing Corp');
    });

    // Update annual revenue
    const revenueInput = screen.getByLabelText(/Annual Revenue/i);
    fireEvent.change(revenueInput, {
      target: { value: '2500000' },
    });

    const submitButton = screen.getByText('Update Account');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(Account.update).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          name: 'Existing Corp',
          annual_revenue: 2500000,
          tenant_id: 'tenant-123',
        })
      );
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Account updated successfully');
    });

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(updatedAccount);
    });
  });

  it('should sanitize empty numeric fields to null', async () => {
    Account.create.mockResolvedValueOnce({ id: 'acc-new' });

    render(
      <AccountForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Account Name/i), {
      target: { value: 'Test Company' },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@company.com' },
    });

    const submitButton = screen.getByText('Create Account');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(Account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          annual_revenue: null, // Empty string should become null
          employee_count: null, // Empty string should become null
        })
      );
    });
  });

  it('should handle API errors gracefully', async () => {
    const apiError = {
      response: {
        data: {
          error: 'Account email already exists',
        },
      },
    };

    Account.create.mockRejectedValueOnce(apiError);

    render(
      <AccountForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Account Name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Account Name/i), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@test.com' },
    });

    const submitButton = screen.getByText('Create Account');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Account email already exists');
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    render(
      <AccountForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });
});
