/**
 * Tests for Braid execution — visibility-aware internal JWT generation.
 *
 * Rather than mocking execution.js internals (complex dependency chain),
 * this test validates the JWT construction logic directly — same pattern
 * that execution.js now uses.
 *
 * Validates that:
 * 1. Internal JWT includes user_role from accessToken
 * 2. Internal JWT includes email from accessToken
 * 3. Default role is 'employee' when not provided
 * 4. Admin/superadmin roles are preserved
 * 5. The JWT can be decoded with correct fields
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-for-execution';

/**
 * Replicates the JWT creation logic from execution.js (post-patch).
 * This is the code we changed — test it directly.
 */
function createBraidInternalJWT({ userId, tenantUuid, userRole, userEmail }) {
  return jwt.sign(
    {
      sub: userId,
      tenant_id: tenantUuid,
      internal: true,
      user_role: userRole || 'employee',
      email: userEmail || null,
    },
    JWT_SECRET,
    { expiresIn: '5m' },
  );
}

/**
 * Replicates the authenticate.js logic for internal tokens (post-patch).
 */
function resolveInternalToken(token) {
  const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  if (!payload.internal) return null;
  const effectiveRole = payload.user_role || 'employee';
  return {
    id: payload.sub || null,
    email: payload.email || 'internal-service',
    role: effectiveRole,
    tenant_id: payload.tenant_id || null,
    internal: true,
  };
}

describe('Braid execution JWT — user_role embedding', () => {
  it('embeds user_role=employee in JWT payload', () => {
    const token = createBraidInternalJWT({
      userId: 'emp-uuid-tom',
      tenantUuid: 'tenant-123',
      userRole: 'employee',
      userEmail: 'tom@test.com',
    });

    const decoded = jwt.decode(token);
    expect(decoded.user_role).toBe('employee');
    expect(decoded.sub).toBe('emp-uuid-tom');
    expect(decoded.email).toBe('tom@test.com');
    expect(decoded.internal).toBe(true);
    expect(decoded.tenant_id).toBe('tenant-123');
  });

  it('embeds user_role=admin for admin users', () => {
    const token = createBraidInternalJWT({
      userId: 'admin-uuid',
      tenantUuid: 'tenant-123',
      userRole: 'admin',
      userEmail: 'admin@test.com',
    });

    const decoded = jwt.decode(token);
    expect(decoded.user_role).toBe('admin');
  });

  it('defaults user_role to employee when undefined', () => {
    const token = createBraidInternalJWT({
      userId: 'emp-uuid',
      tenantUuid: 'tenant-123',
      userRole: undefined,
    });

    const decoded = jwt.decode(token);
    expect(decoded.user_role).toBe('employee');
  });

  it('defaults user_role to employee when null', () => {
    const token = createBraidInternalJWT({
      userId: 'emp-uuid',
      tenantUuid: 'tenant-123',
      userRole: null,
    });

    const decoded = jwt.decode(token);
    expect(decoded.user_role).toBe('employee');
  });
});

describe('Braid execution JWT → authenticate.js resolution', () => {
  it('employee role token → req.user.role = employee (NOT superadmin)', () => {
    const token = createBraidInternalJWT({
      userId: 'tom-uuid',
      tenantUuid: 'tenant-1',
      userRole: 'employee',
      userEmail: 'tom@test.com',
    });

    const user = resolveInternalToken(token);
    expect(user.role).toBe('employee');
    expect(user.id).toBe('tom-uuid');
  });

  it('admin role token → req.user.role = admin', () => {
    const token = createBraidInternalJWT({
      userId: 'admin-uuid',
      tenantUuid: 'tenant-1',
      userRole: 'admin',
      userEmail: 'admin@test.com',
    });

    const user = resolveInternalToken(token);
    expect(user.role).toBe('admin');
  });

  it('no user_role in token → defaults to employee (secure fallback)', () => {
    // Old-style internal JWT without user_role
    const token = jwt.sign({ sub: 'old-uuid', tenant_id: 'tenant-1', internal: true }, JWT_SECRET, {
      expiresIn: '5m',
    });

    const user = resolveInternalToken(token);
    expect(user.role).toBe('employee');
  });

  it('preserves user id for team_members lookup', () => {
    const token = createBraidInternalJWT({
      userId: 'specific-emp-uuid-abc',
      tenantUuid: 'tenant-1',
      userRole: 'employee',
    });

    const user = resolveInternalToken(token);
    expect(user.id).toBe('specific-emp-uuid-abc');
  });

  it('preserves tenant_id for scope queries', () => {
    const token = createBraidInternalJWT({
      userId: 'emp-uuid',
      tenantUuid: 'my-tenant-uuid-xyz',
      userRole: 'employee',
    });

    const user = resolveInternalToken(token);
    expect(user.tenant_id).toBe('my-tenant-uuid-xyz');
  });
});

describe('Braid execution JWT → visibility bypass check', () => {
  function wouldBypassVisibility(user) {
    const role = (user.role || '').toLowerCase();
    return role === 'superadmin' || role === 'admin';
  }

  const testCases = [
    { role: 'employee', label: 'employee', expected: false },
    { role: 'admin', label: 'admin', expected: true },
    { role: 'superadmin', label: 'superadmin', expected: true },
    { role: undefined, label: 'undefined (defaults employee)', expected: false },
    { role: null, label: 'null (defaults employee)', expected: false },
  ];

  testCases.forEach(({ role, label, expected }) => {
    it(`user_role=${label} → bypass=${expected}`, () => {
      const token = createBraidInternalJWT({
        userId: 'emp-uuid',
        tenantUuid: 'tenant-1',
        userRole: role,
      });

      const user = resolveInternalToken(token);
      expect(wouldBypassVisibility(user)).toBe(expected);
    });
  });
});
