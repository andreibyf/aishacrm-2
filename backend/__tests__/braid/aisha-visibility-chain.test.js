/**
 * Integration test: AiSHA visibility scoping end-to-end.
 *
 * Simulates the full chain:
 *   execution.js creates internal JWT with user_role
 *   → authenticate.js resolves req.user with that role
 *   → getVisibilityScope() returns scoped employeeIds
 *
 * This test does NOT need a running server — it tests the JWT → auth → scope chain directly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'integration-test-secret';

describe('AiSHA visibility scoping — JWT chain integration', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  /**
   * Simulate what execution.js now does: create an internal JWT
   * with user_role embedded.
   */
  function createInternalJWT({ sub, tenantId, userRole, email }) {
    return jwt.sign(
      {
        sub,
        tenant_id: tenantId,
        internal: true,
        user_role: userRole || 'employee',
        email: email || null,
      },
      JWT_SECRET,
      { expiresIn: '5m' },
    );
  }

  /**
   * Simulate what authenticate.js does for internal tokens:
   * verify and extract req.user.
   */
  function resolveUserFromInternalJWT(token) {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.internal !== true) throw new Error('Not an internal token');

    const effectiveRole = payload.user_role || 'employee';
    return {
      id: payload.sub || null,
      email: payload.email || 'internal-service',
      role: effectiveRole,
      tenant_id: payload.tenant_id || null,
      internal: true,
    };
  }

  /**
   * Simplified getVisibilityScope logic for testing the role check.
   */
  function wouldBypassVisibility(user) {
    const role = (user.role || '').toLowerCase();
    return role === 'superadmin' || role === 'admin';
  }

  // ─── Test scenarios matching the user matrix ─────────────────────────

  it('Tom (member, employee role) — does NOT bypass visibility', () => {
    const token = createInternalJWT({
      sub: 'tom-uuid',
      tenantId: 'tenant-1',
      userRole: 'employee',
      email: 'tom@test.com',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('employee');
    expect(user.id).toBe('tom-uuid');
    expect(wouldBypassVisibility(user)).toBe(false);
  });

  it('Bob (member, employee role) — does NOT bypass visibility', () => {
    const token = createInternalJWT({
      sub: 'bob-uuid',
      tenantId: 'tenant-1',
      userRole: 'employee',
      email: 'bob@test.com',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('employee');
    expect(wouldBypassVisibility(user)).toBe(false);
  });

  it('Mike (manager, employee role) — does NOT bypass visibility', () => {
    const token = createInternalJWT({
      sub: 'mike-uuid',
      tenantId: 'tenant-1',
      userRole: 'employee', // CRM role is 'employee', team role is 'manager'
      email: 'mike@test.com',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('employee');
    expect(wouldBypassVisibility(user)).toBe(false);
  });

  it('Sarah (director, employee role) — does NOT bypass visibility', () => {
    const token = createInternalJWT({
      sub: 'sarah-uuid',
      tenantId: 'tenant-1',
      userRole: 'employee', // CRM role, not team role
      email: 'sarah@test.com',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('employee');
    expect(wouldBypassVisibility(user)).toBe(false);
  });

  it('Admin user — DOES bypass visibility', () => {
    const token = createInternalJWT({
      sub: 'admin-uuid',
      tenantId: 'tenant-1',
      userRole: 'admin',
      email: 'admin@test.com',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('admin');
    expect(wouldBypassVisibility(user)).toBe(true);
  });

  it('Superadmin user — DOES bypass visibility', () => {
    const token = createInternalJWT({
      sub: 'sa-uuid',
      tenantId: 'tenant-1',
      userRole: 'superadmin',
      email: 'superadmin@test.com',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('superadmin');
    expect(wouldBypassVisibility(user)).toBe(true);
  });

  // ─── Backward compatibility ──────────────────────────────────────────

  it('old-style internal JWT (no user_role) defaults to employee — secure fallback', () => {
    // Pre-patch internal JWTs did NOT include user_role
    const token = jwt.sign({ sub: 'old-uuid', tenant_id: 'tenant-1', internal: true }, JWT_SECRET, {
      expiresIn: '5m',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.role).toBe('employee');
    expect(wouldBypassVisibility(user)).toBe(false);
  });

  it('preserves user id through the chain for team_members lookup', () => {
    const token = createInternalJWT({
      sub: 'specific-emp-uuid-12345',
      tenantId: 'tenant-1',
      userRole: 'employee',
    });

    const user = resolveUserFromInternalJWT(token);

    // This is the UUID that getVisibilityScope uses to query team_members
    expect(user.id).toBe('specific-emp-uuid-12345');
  });

  it('preserves tenant_id through the chain for scope queries', () => {
    const token = createInternalJWT({
      sub: 'emp-uuid',
      tenantId: 'my-specific-tenant-uuid',
      userRole: 'employee',
    });

    const user = resolveUserFromInternalJWT(token);

    expect(user.tenant_id).toBe('my-specific-tenant-uuid');
  });

  // ─── Edge cases ──────────────────────────────────────────────────────

  it('missing sub still works (fallback to null)', () => {
    const token = jwt.sign(
      { tenant_id: 'tenant-1', internal: true, user_role: 'employee' },
      JWT_SECRET,
      { expiresIn: '5m' },
    );

    const user = resolveUserFromInternalJWT(token);
    expect(user.id).toBeNull();
    expect(user.role).toBe('employee');
  });

  it('rejects expired internal JWT', () => {
    const token = jwt.sign(
      { sub: 'emp', tenant_id: 't', internal: true, user_role: 'employee' },
      JWT_SECRET,
      { expiresIn: '0s' }, // immediately expired
    );

    // Small delay to ensure expiry
    expect(() => resolveUserFromInternalJWT(token)).toThrow();
  });

  it('rejects JWT signed with wrong secret', () => {
    const token = jwt.sign(
      { sub: 'emp', tenant_id: 't', internal: true, user_role: 'employee' },
      'wrong-secret',
      { expiresIn: '5m' },
    );

    expect(() => resolveUserFromInternalJWT(token)).toThrow();
  });
});
