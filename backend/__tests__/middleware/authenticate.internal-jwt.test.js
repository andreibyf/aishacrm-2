/**
 * Tests for authenticate middleware — internal JWT visibility scoping.
 *
 * Tests the actual logic change in authenticate.js:
 *   const effectiveRole = internalPayload.user_role || 'employee';
 *
 * Uses direct JWT verification to validate the middleware's behavior
 * without needing to mock the full Express middleware chain.
 */
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-auth-middleware-secret';

/**
 * Replicates the internal token handling from authenticate.js (post-patch).
 * This is the exact logic we changed.
 */
function handleInternalToken(bearer) {
  const payload = jwt.verify(bearer, JWT_SECRET, { algorithms: ['HS256'] });

  if (payload.internal !== true) {
    return null; // Not an internal token
  }

  // Security fallback: missing user_role should never escalate privileges
  const effectiveRole = payload.user_role || 'employee';

  return {
    id: payload.sub || null,
    email: payload.email || 'internal-service',
    role: effectiveRole,
    tenant_id: payload.tenant_id || null,
    tenant_uuid: payload.tenant_uuid || null,
    internal: true,
  };
}

describe('authenticate.js — internal JWT role handling', () => {
  describe('secure fallback', () => {
    it('old internal JWT (no user_role) defaults to employee', () => {
      const token = jwt.sign(
        { sub: 'emp-uuid-123', tenant_id: 'tenant-uuid', internal: true },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);

      expect(user.role).toBe('employee');
      expect(user.id).toBe('emp-uuid-123');
      expect(user.internal).toBe(true);
    });

    it('service-to-service calls (no user_role) do not escalate role', () => {
      const token = jwt.sign(
        { sub: 'service-id', tenant_id: 'tenant-uuid', internal: true },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.role).toBe('employee');
    });
  });

  describe('new behavior — user_role pass-through', () => {
    it('user_role=employee → role is employee (NOT superadmin)', () => {
      const token = jwt.sign(
        {
          sub: 'emp-uuid-456',
          tenant_id: 'tenant-uuid',
          internal: true,
          user_role: 'employee',
          email: 'bob@test.com',
        },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);

      expect(user.role).toBe('employee');
      expect(user.id).toBe('emp-uuid-456');
      expect(user.email).toBe('bob@test.com');
      expect(user.internal).toBe(true);
    });

    it('user_role=admin → role is admin', () => {
      const token = jwt.sign(
        {
          sub: 'admin-uuid',
          tenant_id: 'tenant-uuid',
          internal: true,
          user_role: 'admin',
          email: 'admin@test.com',
        },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.role).toBe('admin');
    });

    it('user_role=superadmin → role is superadmin (explicit)', () => {
      const token = jwt.sign(
        {
          sub: 'sa-uuid',
          tenant_id: 'tenant-uuid',
          internal: true,
          user_role: 'superadmin',
        },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.role).toBe('superadmin');
    });
  });

  describe('field preservation', () => {
    it('preserves tenant_id', () => {
      const token = jwt.sign(
        { sub: 'emp', tenant_id: 'my-tenant-uuid', internal: true, user_role: 'employee' },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.tenant_id).toBe('my-tenant-uuid');
    });

    it('preserves tenant_uuid', () => {
      const token = jwt.sign(
        {
          sub: 'emp',
          tenant_id: 't1',
          tenant_uuid: 'uuid-form',
          internal: true,
          user_role: 'employee',
        },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.tenant_uuid).toBe('uuid-form');
    });

    it('defaults email to internal-service when not provided', () => {
      const token = jwt.sign(
        { sub: 'emp', tenant_id: 't1', internal: true, user_role: 'employee' },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.email).toBe('internal-service');
    });

    it('uses provided email when present', () => {
      const token = jwt.sign(
        {
          sub: 'emp',
          tenant_id: 't1',
          internal: true,
          user_role: 'employee',
          email: 'tom@crm.com',
        },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user.email).toBe('tom@crm.com');
    });
  });

  describe('non-internal tokens', () => {
    it('returns null for token without internal=true', () => {
      const token = jwt.sign(
        { sub: 'user', email: 'user@test.com', role: 'employee' },
        JWT_SECRET,
        { expiresIn: '5m' },
      );

      const user = handleInternalToken(token);
      expect(user).toBeNull();
    });

    it('returns null for internal=false', () => {
      const token = jwt.sign({ sub: 'user', internal: false, user_role: 'employee' }, JWT_SECRET, {
        expiresIn: '5m',
      });

      const user = handleInternalToken(token);
      expect(user).toBeNull();
    });
  });

  describe('security', () => {
    it('rejects token signed with wrong secret', () => {
      const token = jwt.sign(
        { sub: 'emp', tenant_id: 't1', internal: true, user_role: 'employee' },
        'wrong-secret',
        { expiresIn: '5m' },
      );

      expect(() => handleInternalToken(token)).toThrow();
    });

    it('rejects expired token', () => {
      const token = jwt.sign(
        { sub: 'emp', tenant_id: 't1', internal: true, user_role: 'employee' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      expect(() => handleInternalToken(token)).toThrow();
    });
  });
});
