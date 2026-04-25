/**
 * CLS & OpenReplay Fix Validation Tests
 *
 * Verifies that decorative overlays on auth pages include the `or-ignore`
 * class (so OpenReplay skips DOM mutation tracking) and that the loading
 * state uses the same dark background as the login page (eliminating the
 * 0x0 -> full-viewport CLS on the overlay element).
 *
 * Uses Vite ?raw imports to read source as strings — avoids JSDOM hangs
 * from rendering Layout with all its dependencies.
 *
 * Run: npx vitest run --no-coverage src/pages/__tests__/Layout.cls-fix.smoke.test.jsx
 */

import { describe, it, expect } from 'vitest';

// Vite ?raw imports — returns file content as a string, no JSDOM needed.
import layoutSrc from '../Layout.jsx?raw';
import forgotSrc from '../ForgotPassword.jsx?raw';
import resetSrc from '../../components/auth/PasswordResetHandler.jsx?raw';
import orSrc from '../../hooks/useOpenReplay.js?raw';

describe('[CLS] Login overlay has or-ignore class for OpenReplay', () => {
  it('Layout.jsx overlay includes or-ignore', () => {
    expect(layoutSrc).toContain('inset-0 overflow-hidden pointer-events-none or-ignore');
  });

  it('ForgotPassword.jsx overlay includes or-ignore', () => {
    expect(forgotSrc).toContain('inset-0 overflow-hidden pointer-events-none or-ignore');
  });

  it('PasswordResetHandler.jsx overlay includes or-ignore', () => {
    expect(resetSrc).toContain('inset-0 overflow-hidden pointer-events-none or-ignore');
  });

  it('no auth page overlays remain without or-ignore', () => {
    // Matches the old pattern: pointer-events-none" NOT followed by or-ignore
    const oldPattern = /pointer-events-none"(?! or-ignore)/;
    expect(layoutSrc).not.toMatch(oldPattern);
    expect(forgotSrc).not.toMatch(oldPattern);
    expect(resetSrc).not.toMatch(oldPattern);
  });
});

describe('[CLS] Loading state uses dark background to prevent layout shift', () => {
  it('userLoading state has dark background matching login page', () => {
    const loadingBlock = layoutSrc.match(
      /if \(userLoading\) \{[\s\S]*?return \([\s\S]*?\);[\s\S]*?\}/,
    );
    expect(loadingBlock).not.toBeNull();
    expect(loadingBlock[0]).toContain('#080c15');
  });

  it('userLoading state does NOT use light bg-slate-50', () => {
    const loadingBlock = layoutSrc.match(
      /if \(userLoading\) \{[\s\S]*?return \([\s\S]*?\);[\s\S]*?\}/,
    );
    expect(loadingBlock).not.toBeNull();
    expect(loadingBlock[0]).not.toContain('bg-slate-50');
  });
});

describe('[CLS] OpenReplay config uses or-ignore as ignoreClass', () => {
  it('ignoreClass is set to or-ignore in snapshot config', () => {
    expect(orSrc).toContain("ignoreClass: 'or-ignore'");
  });
});
