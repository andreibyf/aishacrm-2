import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import EmployeeForm from '../EmployeeForm';
import { Employee } from '@/api/entities';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/entities', () => ({
  Employee: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../shared/tenantContext', () => ({
  useTenant: () => ({ _selectedTenantId: 'test-tenant-id' }),
}));

describe('EmployeeForm - Unified Submission Pattern', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();
  const testTenantId = 'tenant-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form with empty fields for new employee', () => {
    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    expect(screen.getByPlaceholderText('First name')).toHaveValue('');
    expect(screen.getByPlaceholderText('Last name')).toHaveValue('');
    expect(screen.getByText('Create Employee')).toBeInTheDocument();
  });

  it('should render form with prefilled fields for existing employee (legacy prop)', () => {
    const employee = {
      id: 'emp-1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      department: 'sales',
      job_title: 'Sales Rep',
    };

    render(
      <EmployeeForm
        employee={employee}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    expect(screen.getByPlaceholderText('First name')).toHaveValue('John');
    expect(screen.getByPlaceholderText('Last name')).toHaveValue('Doe');
    expect(screen.getByText('Update Employee')).toBeInTheDocument();
  });

  it('should render form with prefilled fields using new initialData prop', () => {
    const initialData = {
      id: 'emp-2',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com',
      department: 'marketing',
      job_title: 'Marketing Manager',
    };

    render(
      <EmployeeForm
        initialData={initialData}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    expect(screen.getByPlaceholderText('First name')).toHaveValue('Jane');
    expect(screen.getByPlaceholderText('Last name')).toHaveValue('Smith');
  });

  it('should validate required fields before submission', async () => {
    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('First name is required');
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(Employee.create).not.toHaveBeenCalled();
  });

  it('should create new employee and call onSubmit with result', async () => {
    const createdEmployee = {
      id: 'emp-new',
      first_name: 'Alice',
      last_name: 'Johnson',
      department: 'sales',
      job_title: 'Account Executive',
      tenant_id: testTenantId,
    };

    Employee.create.mockResolvedValueOnce(createdEmployee);

    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'Johnson' },
    });
    fireEvent.change(screen.getByPlaceholderText('Role / Title'), {
      target: { value: 'Account Executive' },
    });

    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(Employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Alice',
          last_name: 'Johnson',
          job_title: 'Account Executive',
          department: 'sales',
          tenant_id: testTenantId,
        })
      );
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Employee created successfully');
    });

    // Verify onSubmit was called with the created employee result
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(createdEmployee);
    }, { timeout: 1000 });
  });

  it('should update existing employee and call onSubmit with result', async () => {
    const existingEmployee = {
      id: 'emp-1',
      first_name: 'Bob',
      last_name: 'Williams',
      email: 'bob@example.com',
      department: 'operations',
      job_title: 'Operations Manager',
    };

    const updatedEmployee = {
      ...existingEmployee,
      job_title: 'Senior Operations Manager',
    };

    Employee.update.mockResolvedValueOnce(updatedEmployee);

    render(
      <EmployeeForm
        initialData={existingEmployee}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    // Update job title
    const jobTitleInput = screen.getByPlaceholderText('Role / Title');
    fireEvent.change(jobTitleInput, {
      target: { value: 'Senior Operations Manager' },
    });

    const submitButton = screen.getByText('Update Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(Employee.update).toHaveBeenCalledWith(
        'emp-1',
        expect.objectContaining({
          first_name: 'Bob',
          last_name: 'Williams',
          job_title: 'Senior Operations Manager',
          tenant_id: testTenantId,
        })
      );
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Employee updated successfully');
    });

    // Verify onSubmit was called with the updated result
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(updatedEmployee);
    }, { timeout: 1000 });
  });

  it('should handle API errors gracefully', async () => {
    const apiError = {
      response: {
        data: {
          error: 'Employee email already exists',
        },
      },
    };

    Employee.create.mockRejectedValueOnce(apiError);

    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Charlie' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'Brown' },
    });
    fireEvent.change(screen.getByPlaceholderText('Role / Title'), {
      target: { value: 'Developer' },
    });

    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Employee email already exists');
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should support backward compatibility with legacy onSave prop', async () => {
    const mockOnSave = vi.fn();
    const createdEmployee = {
      id: 'emp-legacy',
      first_name: 'Legacy',
      last_name: 'User',
      department: 'sales',
      job_title: 'Sales Rep',
    };

    Employee.create.mockResolvedValueOnce(createdEmployee);

    render(
      <EmployeeForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Legacy' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'User' },
    });
    fireEvent.change(screen.getByPlaceholderText('Role / Title'), {
      target: { value: 'Sales Rep' },
    });

    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(Employee.create).toHaveBeenCalled();
    });

    // Verify legacy onSave was called (without arguments)
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith();
    }, { timeout: 1000 });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('should call onCancel when cancel button is clicked', () => {
    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should sanitize numeric fields correctly', async () => {
    const createdEmployee = {
      id: 'emp-numeric',
      first_name: 'Test',
      last_name: 'User',
      department: 'sales',
      job_title: 'Rep',
      hourly_rate: 25.50,
    };

    Employee.create.mockResolvedValueOnce(createdEmployee);

    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={testTenantId}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'User' },
    });
    fireEvent.change(screen.getByPlaceholderText('Role / Title'), {
      target: { value: 'Rep' },
    });

    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(Employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hourly_rate: null, // Empty string should become null
        })
      );
    });
  });

  it('should require tenant_id for new employees', async () => {
    render(
      <EmployeeForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        tenantId={null}
      />
    );

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Test' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'User' },
    });
    fireEvent.change(screen.getByPlaceholderText('Role / Title'), {
      target: { value: 'Rep' },
    });

    const submitButton = screen.getByText('Create Employee');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Cannot save employee. Tenant information is missing.'
      );
    });

    expect(Employee.create).not.toHaveBeenCalled();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
