import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { TenantProvider } from '../src/components/shared/tenantContext';

function AllProviders({ children }) {
  return <TenantProvider value={{ tenantId: 'test-tenant' }}>{children}</TenantProvider>;
}

function render(ui, options = {}) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
export { render };
