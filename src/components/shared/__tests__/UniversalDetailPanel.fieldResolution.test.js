import { describe, it, expect } from 'vitest';

/**
 * Pinning test for the `key` / `altKey` resolution rule used inside
 * UniversalDetailPanel's standardFields loop.
 *
 * Schema reality (see docs/reference/DATABASE_REFERENCE.md):
 *   - leads / contacts / accounts / opportunities / bizdev_sources / employees
 *     have ONLY `updated_at` (no `updated_date` column).
 *   - activities has BOTH `updated_at` AND `updated_date`.
 *   - `created_date` exists on most CRM entities; some (e.g. some MCP rows) only
 *     have `created_at`.
 *
 * Display layer must therefore prefer the legacy display name (`updated_date`)
 * when present — for activities continuity — but fall back to `updated_at`
 * for the 6 tables that don't carry the legacy column.
 */

// Inlined copy of the resolution helper from UniversalDetailPanel#standardFields loop.
const isPresent = (entity, k) =>
  k && entity[k] !== undefined && entity[k] !== null && entity[k] !== '';
const resolveKey = (entity, key, altKey) =>
  isPresent(entity, key) ? key : isPresent(entity, altKey) ? altKey : null;

describe('UniversalDetailPanel — Last Updated field resolution', () => {
  it('prefers `updated_date` when both columns are present (activities)', () => {
    const activity = {
      updated_date: '2026-05-06T10:30:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    };
    expect(resolveKey(activity, 'updated_date', 'updated_at')).toBe('updated_date');
  });

  it('falls back to `updated_at` for tables without `updated_date` (lead/contact/account/opp/bizdev/employee)', () => {
    const lead = { updated_at: '2026-05-06T10:30:00Z' };
    expect(resolveKey(lead, 'updated_date', 'updated_at')).toBe('updated_at');
  });

  it('returns null when neither timestamp is present', () => {
    expect(resolveKey({}, 'updated_date', 'updated_at')).toBeNull();
    expect(
      resolveKey({ updated_date: null, updated_at: null }, 'updated_date', 'updated_at'),
    ).toBeNull();
    expect(
      resolveKey({ updated_date: '', updated_at: '' }, 'updated_date', 'updated_at'),
    ).toBeNull();
  });

  it('Created field follows the same rule (created_date preferred, created_at fallback)', () => {
    const lead = { created_date: '2026-01-01T00:00:00Z', created_at: '2025-12-01T00:00:00Z' };
    expect(resolveKey(lead, 'created_date', 'created_at')).toBe('created_date');

    const mcpRow = { created_at: '2026-01-01T00:00:00Z' };
    expect(resolveKey(mcpRow, 'created_date', 'created_at')).toBe('created_at');
  });

  it('treats undefined/null/empty string as absent (so we never render an empty row)', () => {
    expect(isPresent({ x: undefined }, 'x')).toBe(false);
    expect(isPresent({ x: null }, 'x')).toBe(false);
    expect(isPresent({ x: '' }, 'x')).toBe(false);
    expect(isPresent({ x: 0 }, 'x')).toBe(true); // numeric 0 is a valid value
    expect(isPresent({ x: 'abc' }, 'x')).toBe(true);
  });
});
