/**
 * PaymentPortal smoke test.
 *
 * Covers only what PaymentPortal itself owns: the page frame, the loading
 * state, and that it hands off to <BillingAdminConsole mode="tenant" />
 * with a resolved tenantId. The console's behavior is covered by its own
 * test file (BillingAdminConsole.test.jsx).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaymentPortalPage from '../PaymentPortal';

// Mock the heavy child so this test stays a thin smoke test
vi.mock('@/components/settings/BillingAdminConsole', () => ({
  default: ({ mode, tenantId }) => (
    <div data-testid="mock-billing-admin-console">
      mode={mode} tenantId={tenantId ?? 'null'}
    </div>
  ),
}));

vi.mock('@/components/shared/useUser', () => ({
  useUser: vi.fn(),
}));

vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: vi.fn(),
}));

import { useUser } from '@/components/shared/useUser';
import { useTenant } from '@/components/shared/tenantContext';

beforeEach(() => {
  vi.mocked(useUser).mockReset();
  vi.mocked(useTenant).mockReset();
});

describe('PaymentPortal', () => {
  it('shows a loading indicator while the user context is still loading', () => {
    vi.mocked(useUser).mockReturnValue({ user: null, loading: true });
    vi.mocked(useTenant).mockReturnValue({ selectedTenantId: null });
    render(<PaymentPortalPage />);
    expect(screen.getByTestId('payment-portal-loading')).toBeInTheDocument();
  });

  it('renders the page frame and delegates to BillingAdminConsole in tenant mode', async () => {
    vi.mocked(useUser).mockReturnValue({
      user: { role: 'admin', tenant_uuid: 'tenant-uuid-1' },
      loading: false,
    });
    vi.mocked(useTenant).mockReturnValue({ selectedTenantId: null });
    render(<PaymentPortalPage />);
    expect(screen.getByTestId('payment-portal-page')).toBeInTheDocument();
    expect(screen.getByText(/Payment Portal/i)).toBeInTheDocument();
    const mocked = await screen.findByTestId('mock-billing-admin-console');
    expect(mocked).toHaveTextContent('mode=tenant');
    expect(mocked).toHaveTextContent('tenantId=tenant-uuid-1');
  });

  it('prefers selectedTenantId from TenantContext over user.tenant_uuid', () => {
    vi.mocked(useUser).mockReturnValue({
      user: { role: 'admin', tenant_uuid: 'user-tenant' },
      loading: false,
    });
    vi.mocked(useTenant).mockReturnValue({ selectedTenantId: 'picked-tenant' });
    render(<PaymentPortalPage />);
    const mocked = screen.getByTestId('mock-billing-admin-console');
    expect(mocked).toHaveTextContent('tenantId=picked-tenant');
  });

  it('resolves null when neither context nor user has a tenant', () => {
    vi.mocked(useUser).mockReturnValue({ user: { role: 'superadmin' }, loading: false });
    vi.mocked(useTenant).mockReturnValue({ selectedTenantId: null });
    render(<PaymentPortalPage />);
    expect(screen.getByTestId('mock-billing-admin-console')).toHaveTextContent('tenantId=null');
  });
});
