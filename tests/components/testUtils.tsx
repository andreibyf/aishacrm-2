import React from 'react';

/**
 * Test wrapper with mocked providers for Playwright component tests
 */

// Mock tenant context
export const MockTenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

// Mock user context  
export const mockUser = {
  email: 'user@example.com',
  tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
  role: 'employee',
};

export const mockManagerUser = {
  email: 'manager@example.com',
  tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69', 
  role: 'manager',
};

// Mock employees list
export const mockEmployees = [
  { id: 'e1', user_email: 'user@example.com', first_name: 'Sales', last_name: 'Rep', has_crm_access: true },
  { id: 'e2', user_email: 'manager@example.com', first_name: 'Sales', last_name: 'Manager', has_crm_access: true },
];

// Sample account data
export const mockAccount = {
  id: 'acc-1',
  name: 'Test Company',
  email: 'contact@test.com',
  type: 'customer',
  industry: 'construction',
  annual_revenue: 1000000,
  employee_count: 50,
};

// Sample lead data
export const mockLead = {
  id: 'lead-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  status: 'new',
  unique_id: 'L-42',
};
