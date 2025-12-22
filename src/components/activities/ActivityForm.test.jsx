/**
 * Component tests for src/components/activities/ActivityForm.jsx
 * Tests activity form functionality including validation, submission, and AI features
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock all dependencies
vi.mock('@/api/entities', () => ({
  Activity: {
    create: vi.fn(),
    update: vi.fn(),
  },
  Contact: {
    filter: vi.fn(),
  },
  Account: {
    filter: vi.fn(),
  },
  Lead: {
    filter: vi.fn(),
  },
  Opportunity: {
    filter: vi.fn(),
  },
  Note: {
    filter: vi.fn(),
  },
}));

vi.mock('@/components/shared/useUser.js', () => ({
  useUser: vi.fn(),
}));

vi.mock('@/components/shared/EntityLabelsContext', () => ({
  useEntityLabel: vi.fn(),
}));

vi.mock('../shared/TimezoneContext', () => ({
  useTimezone: vi.fn(),
}));

vi.mock('../shared/timezoneUtils', () => ({
  localToUtc: vi.fn(),
  utcToLocal: vi.fn(),
  getCurrentTimezoneOffset: vi.fn(),
}));

vi.mock('../shared/EmployeeSelector', () => ({
  default: ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid="employee-selector">
      <option value="">Select Employee</option>
      <option value="user@example.com">User</option>
    </select>
  ),
}));

vi.mock('@/hooks/useStatusCardPreferences', () => ({
  useStatusCardPreferences: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('date-fns', () => ({
  format: vi.fn(),
}));

// Import the component after mocks
import ActivityForm from './ActivityForm';

// Import mocked modules
import { Activity, Contact, Account, Lead, Opportunity, Note } from '@/api/entities';
import { localToUtc } from '../shared/timezoneUtils';
import { toast } from 'sonner';
import { useUser } from '@/components/shared/useUser.js';
import { useEntityLabel } from '@/components/shared/EntityLabelsContext';
import { useTimezone } from '../shared/TimezoneContext';
import { getCurrentTimezoneOffset } from '../shared/timezoneUtils';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';

describe('ActivityForm', () => {
  const mockUser = { id: '1', email: 'user@example.com', role: 'user' };
  const mockTenantId = 'tenant-123';
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    useUser.mockReturnValue({ user: mockUser });
    useEntityLabel.mockReturnValue({ singular: 'Activity' });
    useTimezone.mockReturnValue({ selectedTimezone: 'UTC' });
    getCurrentTimezoneOffset.mockReturnValue(0);
    useStatusCardPreferences.mockReturnValue({
      isCardVisible: vi.fn(() => true),
      getCardLabel: vi.fn(() => 'Test Label'),
    });

    // Mock entity filters
    Contact.filter.mockResolvedValue([]);
    Account.filter.mockResolvedValue([]);
    Lead.filter.mockResolvedValue([]);
    Opportunity.filter.mockResolvedValue([]);
    Note.filter.mockResolvedValue([]);
  });

  test('renders form with default values for new activity', () => {
    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    expect(screen.getByTestId('activity-type-select')).toBeInTheDocument();
    expect(screen.getByTestId('activity-status-select')).toBeInTheDocument();
    expect(screen.getByTestId('activity-priority-select')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('renders form with activity data for editing', () => {
    const existingActivity = {
      id: 'activity-1',
      subject: 'Test Activity',
      type: 'call',
      status: 'completed',
      priority: 'high',
      description: 'Test description',
      due_date: '2024-01-15',
      due_time: '14:30',
    };

    render(
      <ActivityForm
        activity={existingActivity}
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByDisplayValue('Test Activity')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test description')).toBeInTheDocument();
  });

  test('loads related records on mount', async () => {
    const mockContacts = [{ id: '1', first_name: 'John', last_name: 'Doe' }];
    const mockAccounts = [{ id: '2', name: 'Test Account' }];

    Contact.filter.mockResolvedValue(mockContacts);
    Account.filter.mockResolvedValue(mockAccounts);

    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(Contact.filter).toHaveBeenCalledWith({ tenant_id: mockTenantId });
      expect(Account.filter).toHaveBeenCalledWith({ tenant_id: mockTenantId });
    });
  });

  test('validates required subject field', async () => {
    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const form = screen.getByTestId('activity-form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Subject is required.');
    });
  });

  test('validates due date for calls and meetings', async () => {
    render(
      <ActivityForm
        activity={{ type: 'call', subject: 'Test Call' }} // Initialize with call type
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const form = screen.getByTestId('activity-form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Due Date is required for calls, meetings, demos, and AI scheduled calls.');
    });
  });

  test('validates AI call configuration', async () => {
    render(
      <ActivityForm
        activity={{ type: 'scheduled_ai_call', subject: 'Test AI Call', due_date: '2024-01-15' }} // Initialize with AI call type and due date but no time
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const form = screen.getByTestId('activity-form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('AI Call requires a Due Time.');
    });
  });

  test('creates new activity successfully', async () => {
    const mockActivity = { id: 'new-activity', subject: 'New Activity' };
    Activity.create.mockResolvedValue(mockActivity);
    localToUtc.mockReturnValue('2024-01-15T14:30:00.000Z');

    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Fill form
    const subjectInput = screen.getByLabelText(/subject/i);
    fireEvent.change(subjectInput, { target: { value: 'New Activity' } });

    const descriptionTextarea = screen.getByLabelText(/description/i);
    fireEvent.change(descriptionTextarea, { target: { value: 'Test description' } });

    // Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(Activity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'New Activity',
          description: 'Test description',
          tenant_id: mockTenantId,
          created_by: mockUser.email,
        })
      );
      expect(toast.success).toHaveBeenCalledWith('Created: New Activity');
      expect(mockOnSave).toHaveBeenCalledWith(mockActivity);
    });
  });

  test('updates existing activity successfully', async () => {
    const existingActivity = {
      id: 'activity-1',
      subject: 'Original Subject',
      type: 'task',
    };

    const mockUpdatedActivity = { ...existingActivity, subject: 'Updated Subject' };
    Activity.update.mockResolvedValue(mockUpdatedActivity);

    render(
      <ActivityForm
        activity={existingActivity}
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Update subject
    const subjectInput = screen.getByDisplayValue('Original Subject');
    fireEvent.change(subjectInput, { target: { value: 'Updated Subject' } });

    // Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(Activity.update).toHaveBeenCalledWith('activity-1',
        expect.objectContaining({
          subject: 'Updated Subject',
        })
      );
      expect(toast.success).toHaveBeenCalledWith('Updated: Updated Subject');
      expect(mockOnSave).toHaveBeenCalledWith(mockUpdatedActivity);
    });
  });

  test('handles submission errors gracefully', async () => {
    Activity.create.mockRejectedValue(new Error('Database error'));

    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Fill required field
    const subjectInput = screen.getByLabelText(/subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Test Activity' } });

    // Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error saving activity: Database error');
    });
  });

  test('prevents double submission', async () => {
    Activity.create.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Fill required field
    const subjectInput = screen.getByLabelText(/subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Test Activity' } });

    // Click save twice quickly
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    // Should only call create once
    await waitFor(() => {
      expect(Activity.create).toHaveBeenCalledTimes(1);
    });
  });

  test('loads notes for existing activity', async () => {
    const existingActivity = { id: 'activity-1' };
    const mockNotes = [{ id: 'note-1', content: 'Test note' }];

    Note.filter.mockResolvedValue(mockNotes);

    render(
      <ActivityForm
        activity={existingActivity}
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    await waitFor(() => {
      expect(Note.filter).toHaveBeenCalledWith({
        related_to: 'activity',
        related_id: 'activity-1'
      }, '-created_date');
    });
  });

  test('shows loading state during submission', async () => {
    Activity.create.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({}), 100)));

    render(
      <ActivityForm
        tenantId={mockTenantId}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Fill required field
    const subjectInput = screen.getByLabelText(/subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Test Activity' } });

    // Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    // Should show loading state
    expect(saveButton).toBeDisabled();

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });
});