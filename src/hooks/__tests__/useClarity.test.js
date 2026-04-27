import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock runtimeEnv before importing the hook so getRuntimeEnv reads our values.
const envStore = {};
vi.mock('@/utils/runtimeEnv', () => ({
  getRuntimeEnv: (key) => envStore[key],
  shouldDisableSecureMode: () => false,
}));

import { useClarity } from '../useClarity';

const setEnv = (overrides) => {
  Object.keys(envStore).forEach((k) => delete envStore[k]);
  Object.assign(envStore, overrides);
};

describe('useClarity', () => {
  let originalCreateElement;
  let appendedScripts;

  beforeEach(() => {
    appendedScripts = [];
    delete window.clarity;
    delete window.__clarityProjectId;

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreateElement(tag);
      if (tag === 'script') {
        appendedScripts.push(el);
        // Auto-fire onload synchronously to simulate successful script load
        Object.defineProperty(el, 'src', {
          set(v) {
            this._src = v;
            queueMicrotask(() => {
              if (typeof el.onload === 'function') el.onload();
            });
          },
          get() {
            return this._src;
          },
        });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.clarity;
    delete window.__clarityProjectId;
  });

  it('skips initialization when disabled', () => {
    setEnv({ VITE_CLARITY_ENABLED: 'false', VITE_CLARITY_PROJECT_ID: 'abc' });
    const { result } = renderHook(() => useClarity());
    expect(result.current.isInitialized).toBe(false);
    expect(window.clarity).toBeUndefined();
    expect(appendedScripts).toHaveLength(0);
  });

  it('skips initialization when project id missing', () => {
    setEnv({ VITE_CLARITY_ENABLED: 'true', VITE_CLARITY_PROJECT_ID: '' });
    const { result } = renderHook(() => useClarity());
    expect(result.current.isInitialized).toBe(false);
    expect(appendedScripts).toHaveLength(0);
  });

  it('appends Clarity script and initializes when enabled with project id', async () => {
    setEnv({ VITE_CLARITY_ENABLED: 'true', VITE_CLARITY_PROJECT_ID: 'proj123' });

    const { result } = renderHook(() => useClarity());

    // The queue function should be defined immediately so calls before
    // script load are buffered.
    expect(typeof window.clarity).toBe('function');
    expect(appendedScripts).toHaveLength(1);
    expect(appendedScripts[0].src).toContain('https://www.clarity.ms/tag/proj123');

    // Wait for the simulated onload microtask
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isInitialized).toBe(true);
    expect(result.current.sessionUrl).toContain('proj123');
  });

  it('setUserInfo issues identify + set calls and tolerates undefined fields', async () => {
    setEnv({ VITE_CLARITY_ENABLED: 'true', VITE_CLARITY_PROJECT_ID: 'p' });

    const calls = [];
    // Pre-install a spy clarity to capture calls regardless of script load.
    window.clarity = function spyClarity(...args) {
      calls.push(args);
    };
    window.__clarityProjectId = 'p';

    const { result } = renderHook(() => useClarity());

    act(() => {
      result.current.setUserInfo('user-1', {
        email: 'a@b.com',
        name: 'Andrei',
        role: 'admin',
        tenantId: 'tenant-1',
        userId: 'u1',
        empty: '',
        nothing: undefined,
        nullish: null,
      });
    });

    expect(calls[0][0]).toBe('identify');
    expect(calls[0][1]).toBe('user-1');
    expect(calls[0][4]).toBe('Andrei');

    const setCalls = calls.filter((c) => c[0] === 'set').map((c) => c[1]);
    expect(setCalls).toEqual(
      expect.arrayContaining(['email', 'name', 'role', 'tenantId', 'userId']),
    );
    // Empty/null/undefined values must be filtered out
    expect(setCalls).not.toContain('empty');
    expect(setCalls).not.toContain('nothing');
    expect(setCalls).not.toContain('nullish');
  });

  it('trackEvent issues an event call plus per-key set calls for payload', () => {
    setEnv({ VITE_CLARITY_ENABLED: 'true', VITE_CLARITY_PROJECT_ID: 'p' });
    const calls = [];
    window.clarity = function spyClarity(...args) {
      calls.push(args);
    };
    window.__clarityProjectId = 'p';

    const { result } = renderHook(() => useClarity());

    act(() => {
      result.current.trackEvent('ui_click', { tag: 'BUTTON', text: 'Save' });
    });

    expect(calls.find((c) => c[0] === 'event' && c[1] === 'ui_click')).toBeTruthy();
    const setKeys = calls.filter((c) => c[0] === 'set').map((c) => c[1]);
    expect(setKeys).toContain('ui_click.tag');
    expect(setKeys).toContain('ui_click.text');
  });

  it('enableAssist returns false (Clarity has no take-over)', () => {
    setEnv({ VITE_CLARITY_ENABLED: 'true', VITE_CLARITY_PROJECT_ID: 'p' });
    const { result } = renderHook(() => useClarity());
    expect(result.current.enableAssist()).toBe(false);
  });

  it('does not throw when clarity API is missing (graceful degradation)', () => {
    setEnv({ VITE_CLARITY_ENABLED: 'true', VITE_CLARITY_PROJECT_ID: 'p' });
    delete window.clarity;
    const { result } = renderHook(() => useClarity());
    // Override to undefined to ensure noop branch
    delete window.clarity;
    expect(() => result.current.setUserInfo('u', { email: 'a@b' })).not.toThrow();
    expect(() => result.current.trackEvent('x')).not.toThrow();
  });
});
