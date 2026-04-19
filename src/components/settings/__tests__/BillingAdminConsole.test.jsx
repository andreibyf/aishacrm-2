/**
 * BillingAdminConsole unit tests
 *
 * Covers both modes (tenant + superadmin), the exempt-branch short-circuit,
 * the tenant-picker superadmin entry screen, and the two primary handler
 * paths (tenant Checkout, superadmin direct assign/change).
 *
 * These are behavioural tests only: we don't snapshot the markup, we assert
 * that the console calls the right API endpoints with the right shape for
 * each state it can land in. The underlying billing components are covered
 * by their own test files.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import BillingAdminConsole from '../BillingAdminConsole';
import * as billing from '@/api/billing';
import { Tenant } from '@/api/entities';

// Mock the entities module (only Tenant.list used by this component)
vi.mock('@/api/entities', () => ({
  Tenant: { list: vi.fn() },
}));

// Mock toasts so we don't leak state between tests
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Radix Select calls element.scrollIntoView on mount when its content opens.
// JSDOM doesn't implement it, so the portal throws and tears the tree down.
// Stubbing it on the Element prototype is the standard workaround.
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  // Radix also calls hasPointerCapture / releasePointerCapture on pointer events.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = vi.fn();
  }
});

const STARTER_PLAN = {
  code: 'starter_monthly',
  name: 'Starter',
  description: 'Basic tier',
  billing_interval: 'month',
  amount_cents: 4900,
  currency: 'USD',
  features: ['200 seats'],
};

const GROWTH_PLAN = {
  code: 'growth_monthly',
  name: 'Growth',
  description: 'Higher tier',
  billing_interval: 'month',
  amount_cents: 14900,
  currency: 'USD',
  features: ['500 seats'],
};

const PLANS = [STARTER_PLAN, GROWTH_PLAN];

function stubHappyPath({ exempt = false, subscription = null } = {}) {
  vi.spyOn(billing, 'listPlans').mockResolvedValue(PLANS);
  vi.spyOn(billing, 'getAccount').mockResolvedValue({
    id: 'a1',
    tenant_id: 't1',
    billing_exempt: exempt,
    exemption_reason: exempt ? 'pilot' : null,
    exemption_set_at: exempt ? '2026-04-01T00:00:00Z' : null,
    default_payment_method_last4: '4242',
    default_payment_method_brand: 'visa',
    provider_customer_id: 'cus_123',
  });
  vi.spyOn(billing, 'getSubscription').mockResolvedValue(subscription);
  vi.spyOn(billing, 'listInvoices').mockResolvedValue([]);
  vi.spyOn(billing, 'getBillingSummary').mockResolvedValue({
    tenant: { id: 't1', name: 'Acme', billing_state: 'active' },
    billing_account: { id: 'a1', billing_exempt: exempt },
    subscription,
    recent_invoices: [],
  });
  vi.spyOn(billing, 'listEvents').mockResolvedValue([]);
}

beforeEach(() => {
  vi.restoreAllMocks();
  Tenant.list.mockReset();
  // Prevent JSDOM 'not implemented: navigation' noise when the console
  // sets window.location.href = <stripe_url>. We stub .assign and override
  // the href setter so assignments are swallowed silently.
  //
  // JSDOM's window.location is non-configurable; the only reliable way to
  // swap it in a test is the delete-then-reassign pattern.
  try {
     
    delete window.location;
  } catch {
    /* ignore */
  }
  window.location = {
    origin: 'http://localhost:4000',
    pathname: '/PaymentPortal',
    href: 'http://localhost:4000/PaymentPortal',
    search: '',
    hash: '',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BillingAdminConsole -- tenant mode', () => {
  it('renders an empty-state card when no tenant is provided', () => {
    render(<BillingAdminConsole mode="tenant" tenantId={null} />);
    expect(screen.getByText(/no tenant is currently selected/i)).toBeInTheDocument();
  });

  it('renders the ExemptBanner when account.billing_exempt is true', async () => {
    stubHappyPath({ exempt: true });
    render(<BillingAdminConsole mode="tenant" tenantId="t1" />);
    await waitFor(() => {
      expect(screen.getByTestId('exempt-banner')).toBeInTheDocument();
    });
    // No plan selector in exempt mode
    expect(screen.queryByText(/Choose a plan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Change plan/i)).not.toBeInTheDocument();
  });

  it('renders the plan selector and invoices for a non-exempt tenant with no active sub', async () => {
    stubHappyPath({ exempt: false, subscription: null });
    render(<BillingAdminConsole mode="tenant" tenantId="t1" />);
    // Wait for any of the plans to render (plans load via usePlans).
    // Using findByText directly so vitest's waitFor retries with the default 5s.
    expect(await screen.findByText('Starter', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('Growth')).toBeInTheDocument();
    // Invoice table empty state
    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it('clicking a plan in tenant-mode calls createCheckoutSession and redirects', async () => {
    stubHappyPath({ exempt: false, subscription: null });
    const checkoutSpy = vi
      .spyOn(billing, 'createCheckoutSession')
      .mockResolvedValue({ url: 'https://stripe.example/checkout/sess_1', session_id: 'sess_1' });

    render(<BillingAdminConsole mode="tenant" tenantId="t1" />);
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    // The card's CTA is labelled "Select plan" by default
    const starterButton = screen.getAllByRole('button', { name: /Select plan/i })[0];
    await act(async () => {
      fireEvent.click(starterButton);
    });

    await waitFor(() => {
      expect(checkoutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't1',
          plan_code: 'starter_monthly',
          success_url: expect.stringContaining('/PaymentPortal?checkout=success'),
          cancel_url: expect.stringContaining('/PaymentPortal?checkout=cancel'),
        }),
      );
    });
  });
});

describe('BillingAdminConsole -- superadmin mode', () => {
  it('prompts for tenant selection when none is picked', async () => {
    Tenant.list.mockResolvedValue([
      { id: 't1', name: 'Acme', display_order: 1 },
      { id: 't2', name: 'Beta', display_order: 2 },
    ]);
    render(<BillingAdminConsole mode="superadmin" />);
    expect(
      screen.getByText(/Select a tenant to view and manage their billing/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('billing-tenant-picker')).toBeInTheDocument();
    });
  });

  it('clicking a plan in superadmin-mode with NO active sub calls assignPlan', async () => {
    // No active subscription -> assignPlan path
    stubHappyPath({ exempt: false, subscription: null });
    Tenant.list.mockResolvedValue([{ id: 't1', name: 'Acme', display_order: 1 }]);
    const assignSpy = vi
      .spyOn(billing, 'assignPlan')
      .mockResolvedValue({ id: 'sub_new', status: 'active' });

    // Render directly with a hand-selected tenant id using the superadmin mode's
    // internal state by first mounting the picker, then simulating a pick.
    // For simplicity, skip the picker and render with tenantId in state via
    // a wrapper that directly exercises the tenantPick => main-body branch.
    // Instead, we test the logic by invoking the tenant-mode equivalent but
    // assert the correct billing function is called given `mode="superadmin"`.
    // The simplest route: extend stubHappyPath and render in superadmin mode,
    // then programmatically select the tenant via the shadcn Select trigger.
    render(<BillingAdminConsole mode="superadmin" />);

    // Wait for the tenant list to load, then open the Select and pick t1
    await waitFor(() => expect(screen.getByTestId('billing-tenant-picker')).toBeInTheDocument());

    const trigger = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.click(trigger);
    });
    const option = await screen.findByRole('option', { name: 'Acme' });
    await act(async () => {
      fireEvent.click(option);
    });

    // Now plans should render
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    const starterBtn = screen.getAllByRole('button', { name: /Select plan/i })[0];
    await act(async () => {
      fireEvent.click(starterBtn);
    });

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ plan_code: 'starter_monthly' }),
      );
    });
  });
});
