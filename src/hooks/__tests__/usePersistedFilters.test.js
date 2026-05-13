import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedFilters } from '../usePersistedFilters';

// ---------- sessionStorage mock ----------
let store = {};
const sessionStorageMock = {
  getItem: vi.fn((k) => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = v; }),
  removeItem: vi.fn((k) => { delete store[k]; }),
  clear: vi.fn(() => { store = {}; }),
};
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});
afterEach(() => {
  store = {};
});

const KEY = 'aishacrm:filters:tenant-abc:user-123:leads';
const DEFAULTS = { searchTerm: '', statusFilter: 'all', selectedTags: [] };

describe('usePersistedFilters', () => {
  // ── initial state ────────────────────────────────────────────────────────
  it('returns defaults when sessionStorage is empty', () => {
    const { result } = renderHook(() =>
      usePersistedFilters(KEY, DEFAULTS),
    );
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it('restores saved state from sessionStorage on mount', () => {
    store[KEY] = JSON.stringify({ searchTerm: 'acme', statusFilter: 'new', selectedTags: ['vip'] });
    const { result } = renderHook(() => usePersistedFilters(KEY, DEFAULTS));
    expect(result.current[0]).toEqual({
      searchTerm: 'acme',
      statusFilter: 'new',
      selectedTags: ['vip'],
    });
  });

  it('merges saved state with defaults — new default fields get their default value', () => {
    // Simulate an old save that is missing a newly-added filter field
    store[KEY] = JSON.stringify({ searchTerm: 'hello' });
    const { result } = renderHook(() =>
      usePersistedFilters(KEY, { ...DEFAULTS, newField: 'fresh' }),
    );
    expect(result.current[0].newField).toBe('fresh');
    expect(result.current[0].searchTerm).toBe('hello');
  });

  it('returns defaults when sessionStorage contains invalid JSON', () => {
    store[KEY] = 'not-json{{{';
    const { result } = renderHook(() => usePersistedFilters(KEY, DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  // ── setFilter ────────────────────────────────────────────────────────────
  it('setFilter updates a single field and persists to sessionStorage', () => {
    const { result } = renderHook(() => usePersistedFilters(KEY, DEFAULTS));
    act(() => result.current[1]('searchTerm', 'acme'));
    expect(result.current[0].searchTerm).toBe('acme');
    expect(result.current[0].statusFilter).toBe('all'); // other fields untouched
    const saved = JSON.parse(store[KEY]);
    expect(saved.searchTerm).toBe('acme');
  });

  it('setFilter handles array values (selectedTags)', () => {
    const { result } = renderHook(() => usePersistedFilters(KEY, DEFAULTS));
    act(() => result.current[1]('selectedTags', ['vip', 'hot']));
    expect(result.current[0].selectedTags).toEqual(['vip', 'hot']);
    expect(JSON.parse(store[KEY]).selectedTags).toEqual(['vip', 'hot']);
  });

  it('setFilter handles object values (dateRange)', () => {
    const keyWithDate = 'aishacrm:filters:t:u:activities';
    const dateDefaults = { dateRange: { start: null, end: null } };
    const { result } = renderHook(() =>
      usePersistedFilters(keyWithDate, dateDefaults),
    );
    act(() => result.current[1]('dateRange', { start: '2026-01-01', end: '2026-01-31' }));
    expect(result.current[0].dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(JSON.parse(store[keyWithDate]).dateRange.start).toBe('2026-01-01');
  });

  // ── resetFilters ─────────────────────────────────────────────────────────
  it('resetFilters reverts state to defaults and removes sessionStorage entry', () => {
    store[KEY] = JSON.stringify({ searchTerm: 'acme', statusFilter: 'new', selectedTags: [] });
    const { result } = renderHook(() => usePersistedFilters(KEY, DEFAULTS));
    act(() => result.current[2]()); // resetFilters
    expect(result.current[0]).toEqual(DEFAULTS);
    expect(store[KEY]).toBeUndefined();
  });

  // ── tenant isolation ─────────────────────────────────────────────────────
  it('different tenant keys are fully isolated', () => {
    const keyA = 'aishacrm:filters:tenant-A:user-1:leads';
    const keyB = 'aishacrm:filters:tenant-B:user-1:leads';

    store[keyA] = JSON.stringify({ searchTerm: 'tenant-a-data', statusFilter: 'all', selectedTags: [] });

    const { result: resultA } = renderHook(() => usePersistedFilters(keyA, DEFAULTS));
    const { result: resultB } = renderHook(() => usePersistedFilters(keyB, DEFAULTS));

    expect(resultA.current[0].searchTerm).toBe('tenant-a-data');
    expect(resultB.current[0].searchTerm).toBe(''); // tenant B sees defaults
  });

  // ── user isolation ───────────────────────────────────────────────────────
  it('different user keys are fully isolated', () => {
    const keyUser1 = 'aishacrm:filters:tenant-X:user-1:leads';
    const keyUser2 = 'aishacrm:filters:tenant-X:user-2:leads';

    store[keyUser1] = JSON.stringify({ searchTerm: 'user1-filter', statusFilter: 'all', selectedTags: [] });

    const { result: r1 } = renderHook(() => usePersistedFilters(keyUser1, DEFAULTS));
    const { result: r2 } = renderHook(() => usePersistedFilters(keyUser2, DEFAULTS));

    expect(r1.current[0].searchTerm).toBe('user1-filter');
    expect(r2.current[0].searchTerm).toBe('');
  });

  // ── incomplete / null key ────────────────────────────────────────────────
  it('falls back to defaults and does not read/write sessionStorage when key is null', () => {
    const { result } = renderHook(() => usePersistedFilters(null, DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
    act(() => result.current[1]('searchTerm', 'test'));
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('falls back to defaults and does not read/write sessionStorage when key contains null', () => {
    const badKey = 'aishacrm:filters:null:null:leads';
    const { result } = renderHook(() => usePersistedFilters(badKey, DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
    act(() => result.current[1]('searchTerm', 'test'));
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
  });

  // ── persistence across re-mount ──────────────────────────────────────────
  it('restores filter after unmount and remount (simulates navigation away and back)', () => {
    const { result, unmount } = renderHook(() =>
      usePersistedFilters(KEY, DEFAULTS),
    );
    act(() => result.current[1]('statusFilter', 'qualified'));
    unmount();

    // Remount — simulates user navigating back to the list page
    const { result: result2 } = renderHook(() =>
      usePersistedFilters(KEY, DEFAULTS),
    );
    expect(result2.current[0].statusFilter).toBe('qualified');
  });

  // ── rehydration on storageKey change ─────────────────────────────────────
  it('rehydrates from sessionStorage when storageKey transitions from null to a real key', () => {
    // Pre-seed sessionStorage as if a previous session had saved filters
    store[KEY] = JSON.stringify({
      searchTerm: 'restored',
      statusFilter: 'qualified',
      selectedTags: ['vip'],
    });

    // First render: tenant/user not yet resolved → key is null
    const { result, rerender } = renderHook(
      ({ key }) => usePersistedFilters(key, DEFAULTS),
      { initialProps: { key: null } },
    );
    expect(result.current[0]).toEqual(DEFAULTS);

    // Tenant/user context resolves → key flips to a real value
    rerender({ key: KEY });
    expect(result.current[0]).toEqual({
      searchTerm: 'restored',
      statusFilter: 'qualified',
      selectedTags: ['vip'],
    });
  });

  it('rehydrates when storageKey changes between two real keys (tenant switch)', () => {
    const keyA = 'aishacrm:filters:tenant-A:user-1:leads';
    const keyB = 'aishacrm:filters:tenant-B:user-1:leads';
    store[keyA] = JSON.stringify({ searchTerm: 'tenant-a', statusFilter: 'all', selectedTags: [] });
    store[keyB] = JSON.stringify({ searchTerm: 'tenant-b', statusFilter: 'new', selectedTags: ['b'] });

    const { result, rerender } = renderHook(
      ({ key }) => usePersistedFilters(key, DEFAULTS),
      { initialProps: { key: keyA } },
    );
    expect(result.current[0].searchTerm).toBe('tenant-a');

    // Simulate superadmin switching tenant — key changes
    rerender({ key: keyB });
    expect(result.current[0]).toEqual({
      searchTerm: 'tenant-b',
      statusFilter: 'new',
      selectedTags: ['b'],
    });
  });

  it('resets to defaults when storageKey transitions from a real key back to null (logout)', () => {
    store[KEY] = JSON.stringify({ searchTerm: 'sensitive', statusFilter: 'new', selectedTags: [] });

    const { result, rerender } = renderHook(
      ({ key }) => usePersistedFilters(key, DEFAULTS),
      { initialProps: { key: KEY } },
    );
    expect(result.current[0].searchTerm).toBe('sensitive');

    // Logout / tenant context cleared
    rerender({ key: null });
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it('uses defaults when storageKey transitions to a real key with no saved state', () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePersistedFilters(key, DEFAULTS),
      { initialProps: { key: null } },
    );

    const freshKey = 'aishacrm:filters:tenant-Z:user-9:leads';
    rerender({ key: freshKey });
    expect(result.current[0]).toEqual(DEFAULTS);
  });
});
