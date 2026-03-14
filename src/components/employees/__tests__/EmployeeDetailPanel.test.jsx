import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmployeeDetailPanel from '../EmployeeDetailPanel';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:4001',
}));

vi.mock('@/api/entities', () => ({
  User: {
    me: vi.fn().mockResolvedValue({ role: 'admin', employee_role: 'manager' }),
  },
}));

vi.mock('@/api/functions', () => ({
  syncEmployeeUserPermissions: vi.fn(),
}));

describe('EmployeeDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows linked_user_id in CRM Access & Permissions', () => {
    render(
      <EmployeeDetailPanel
        open
        employee={{
          id: 'emp-1',
          first_name: 'Link',
          last_name: 'Tester',
          email: 'link@example.com',
          department: 'sales',
          employment_status: 'active',
          employment_type: 'full_time',
          has_crm_access: true,
          user_email: 'link@example.com',
          metadata: {
            linked_user_id: 'user-123',
          },
        }}
        onOpenChange={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        user={{ role: 'admin' }}
      />,
    );

    expect(screen.getAllByText('User ID:')).toHaveLength(1);
    expect(screen.getByText('user-123')).toBeInTheDocument();
  });
});
