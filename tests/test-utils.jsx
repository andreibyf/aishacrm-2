import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { vi } from 'vitest';
import TenantContext from '../src/components/shared/tenantContext';

const testTenantValue = {
  selectedTenantId: 'test-tenant-id',
  setSelectedTenantId: vi.fn(),
};

function AllProviders({ children }) {
  return <TenantContext.Provider value={testTenantValue}>{children}</TenantContext.Provider>;
}

function render(ui, options = {}) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
export { render };
