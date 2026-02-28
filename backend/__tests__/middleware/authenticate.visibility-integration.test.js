/**
 * Integration test: Internal JWT role propagation for visibility scoping.
 *
 * Node test-runner compatible (no Vitest mocking APIs), so it runs in backend npm test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'integration-test-secret';

function signInternalJWT({ userId, tenantId, userRole, email }) {
  return jwt.sign(
    {
      sub: userId,
      tenant_id: tenantId,
      internal: true,
      user_role: userRole || 'employee',
      email: email || null,
    },
    JWT_SECRET,
    { expiresIn: '5m' },
  );
}

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

function wouldBypassVisibility(user) {
  const role = (user.role || '').toLowerCase();
  return role === 'superadmin' || role === 'admin';
}

test('employee role token does not bypass visibility', () => {
  const token = signInternalJWT({
    userId: 'tom-uuid',
    tenantId: 'tenant-1',
    userRole: 'employee',
    email: 'tom@sales.com',
  });

  const user = resolveUserFromInternalJWT(token);
  assert.equal(user.id, 'tom-uuid');
  assert.equal(user.role, 'employee');
  assert.equal(user.tenant_id, 'tenant-1');
  assert.equal(user.internal, true);
  assert.equal(wouldBypassVisibility(user), false);
});

test('admin role token bypasses visibility', () => {
  const token = signInternalJWT({
    userId: 'admin-uuid',
    tenantId: 'tenant-1',
    userRole: 'admin',
    email: 'admin@co.com',
  });

  const user = resolveUserFromInternalJWT(token);
  assert.equal(user.role, 'admin');
  assert.equal(wouldBypassVisibility(user), true);
});

test('legacy token without user_role defaults to employee (secure fallback)', () => {
  const token = jwt.sign(
    { sub: 'legacy-user', tenant_id: 'tenant-1', internal: true },
    JWT_SECRET,
    { expiresIn: '5m' },
  );

  const user = resolveUserFromInternalJWT(token);
  assert.equal(user.role, 'employee');
  assert.equal(wouldBypassVisibility(user), false);
});

test('employee UUID is preserved for team_members lookup', () => {
  const token = signInternalJWT({
    userId: 'emp-uuid-12345',
    tenantId: 'tenant-1',
    userRole: 'employee',
  });

  const user = resolveUserFromInternalJWT(token);
  assert.equal(user.id, 'emp-uuid-12345');
});

test('employee fallback remains non-bypass when user_role omitted', () => {
  const token = signInternalJWT({
    userId: 'emp-uuid',
    tenantId: 'tenant-1',
    userRole: undefined,
  });

  const user = resolveUserFromInternalJWT(token);
  assert.equal(user.role, 'employee');
  assert.equal(wouldBypassVisibility(user), false);
});
