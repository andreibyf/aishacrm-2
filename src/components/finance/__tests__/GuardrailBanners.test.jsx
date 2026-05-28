/**
 * GuardrailBanners (UI-1B) — visibility, dismiss, design-ref attribution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GuardrailBanners, { __BANNER_DEFS_FOR_TESTS as BANNER_DEFS } from '../GuardrailBanners';

function clearSession() {
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.clear();
    } catch {
      /* ignore */
    }
  }
}

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('GuardrailBanners — banner inventory matches design freeze §10', () => {
  it('defines exactly four banners with stable ids', () => {
    expect(BANNER_DEFS.map((b) => b.id)).toEqual([
      'persistent-events-fail-closed',
      'provider-writes-default-closed',
      'sandbox-only-adapter',
      'production-activation-not-authorized',
    ]);
  });

  it('every banner has a §10.x design reference', () => {
    for (const b of BANNER_DEFS) {
      expect(b.designRef).toMatch(/^§10\./);
    }
  });

  it('every banner carries a non-empty title and body string', () => {
    for (const b of BANNER_DEFS) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.body.length).toBeGreaterThan(0);
    }
  });
});

describe('GuardrailBanners — default rendering (Slice 1 posture)', () => {
  it('renders all four banners when status is null (conservative default)', () => {
    render(<GuardrailBanners status={null} />);
    expect(
      screen.getByTestId('finance-guardrail-banner-persistent-events-fail-closed'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('finance-guardrail-banner-provider-writes-default-closed'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('finance-guardrail-banner-sandbox-only-adapter')).toBeInTheDocument();
    expect(
      screen.getByTestId('finance-guardrail-banner-production-activation-not-authorized'),
    ).toBeInTheDocument();
  });

  it('renders persistence + provider-sync banners while in-memory + disabled', () => {
    render(
      <GuardrailBanners
        status={{
          runtime: { persistence: 'in_memory', provider_sync: 'disabled' },
        }}
      />,
    );
    expect(
      screen.getByTestId('finance-guardrail-banner-persistent-events-fail-closed'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('finance-guardrail-banner-provider-writes-default-closed'),
    ).toBeInTheDocument();
  });
});

describe('GuardrailBanners — conditional persistence banner', () => {
  it('hides the persistent-events banner when persistence is postgres-projection', () => {
    render(
      <GuardrailBanners
        status={{
          runtime: { persistence: 'postgres-projection', provider_sync: 'disabled' },
        }}
      />,
    );
    expect(
      screen.queryByTestId('finance-guardrail-banner-persistent-events-fail-closed'),
    ).not.toBeInTheDocument();
    // Sandbox + production banners remain unconditional
    expect(screen.getByTestId('finance-guardrail-banner-sandbox-only-adapter')).toBeInTheDocument();
    expect(
      screen.getByTestId('finance-guardrail-banner-production-activation-not-authorized'),
    ).toBeInTheDocument();
  });

  it('hides the provider-writes banner when provider_sync is enabled', () => {
    render(
      <GuardrailBanners
        status={{
          runtime: { persistence: 'in_memory', provider_sync: 'enabled' },
        }}
      />,
    );
    expect(
      screen.queryByTestId('finance-guardrail-banner-provider-writes-default-closed'),
    ).not.toBeInTheDocument();
  });

  it('sandbox + production banners stay visible regardless of runtime state', () => {
    render(
      <GuardrailBanners
        status={{
          runtime: { persistence: 'postgres-projection', provider_sync: 'enabled' },
        }}
      />,
    );
    expect(screen.getByTestId('finance-guardrail-banner-sandbox-only-adapter')).toBeInTheDocument();
    expect(
      screen.getByTestId('finance-guardrail-banner-production-activation-not-authorized'),
    ).toBeInTheDocument();
  });
});

describe('GuardrailBanners — per-session dismiss', () => {
  it('clicking dismiss hides that banner but leaves the others visible', () => {
    render(<GuardrailBanners status={null} />);
    const dismissBtn = screen.getByRole('button', {
      name: /dismiss persistent events are disabled for this session/i,
    });
    fireEvent.click(dismissBtn);
    expect(
      screen.queryByTestId('finance-guardrail-banner-persistent-events-fail-closed'),
    ).not.toBeInTheDocument();
    // Other three still visible
    expect(
      screen.getByTestId('finance-guardrail-banner-provider-writes-default-closed'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('finance-guardrail-banner-sandbox-only-adapter')).toBeInTheDocument();
    expect(
      screen.getByTestId('finance-guardrail-banner-production-activation-not-authorized'),
    ).toBeInTheDocument();
  });

  it('dismissed banners stay dismissed across re-mount within the same session', () => {
    const { unmount } = render(<GuardrailBanners status={null} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: /dismiss sandbox-only adapter is sandbox-only|adapter is sandbox-only/i,
      }),
    );
    expect(
      screen.queryByTestId('finance-guardrail-banner-sandbox-only-adapter'),
    ).not.toBeInTheDocument();

    unmount();
    render(<GuardrailBanners status={null} />);
    expect(
      screen.queryByTestId('finance-guardrail-banner-sandbox-only-adapter'),
    ).not.toBeInTheDocument();
  });

  it('returns null when every visible banner has been dismissed', () => {
    const { container } = render(<GuardrailBanners status={null} />);
    for (const def of BANNER_DEFS) {
      const dismissBtn = screen.queryByRole('button', {
        name: new RegExp(`dismiss ${def.title}`, 'i'),
      });
      if (dismissBtn) fireEvent.click(dismissBtn);
    }
    expect(container.querySelector('[data-testid="finance-guardrail-banners"]')).toBeNull();
  });
});

describe('GuardrailBanners — no mutating affordance present', () => {
  it('contains no button labeled like a mutating action', () => {
    render(<GuardrailBanners status={null} />);
    const banner = screen.getByTestId('finance-guardrail-banners');
    const mutatingPattern =
      /approve|reject|reverse|replay|retry|cancel|trigger|enable provider writes|activate|production/i;
    // Inside the banner stack: the only buttons should be the per-banner
    // dismiss controls. The banner body text intentionally mentions things
    // like "production activation" descriptively — only button text matters.
    const buttons = banner.querySelectorAll('button');
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') || btn.textContent || '';
      if (mutatingPattern.test(label)) {
        // false positive guard: dismiss aria-label includes the banner title
        // ("Production activation is not authorized"); only fail if it's NOT
        // a dismiss button.
        expect(label.toLowerCase()).toMatch(/^dismiss /);
      }
    }
  });
});
