import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { io as createClient } from 'socket.io-client';
import { getSupabaseClient } from '../../lib/supabase-db.js';

function waitForEvent(target, eventName, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for "${eventName}"`));
    }, timeoutMs);

    const onEvent = (payload) => {
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      target.off(eventName, onEvent);
    };

    target.on(eventName, onEvent);
  });
}

function waitForSocketConnected(socket, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for socket connection'));
    }, timeoutMs);

    const onConnected = (payload) => {
      cleanup();
      resolve(payload);
    };
    const onConnectError = (err) => {
      cleanup();
      reject(new Error(`Socket connect_error: ${err?.message || 'unknown'}`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('connected', onConnected);
      socket.off('connect_error', onConnectError);
    };

    socket.on('connected', onConnected);
    socket.on('connect_error', onConnectError);
  });
}

test('websocket auth + support friction alert smoke', async (t) => {
  const resolvedSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null;
  if (!resolvedSupabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    t.skip(
      'SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY are required for websocket smoke test',
    );
    return;
  }

  const prevSupabaseUrl = process.env.SUPABASE_URL;
  const prevJwtSecret = process.env.JWT_SECRET;
  const prevSupportIntelligence = process.env.SUPPORT_INTELLIGENCE_ENABLED;
  process.env.SUPABASE_URL = resolvedSupabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'websocket-smoke-test-secret';
  process.env.SUPPORT_INTELLIGENCE_ENABLED = 'true';

  const supabase = getSupabaseClient();
  let selectedUser = null;
  let socket = null;
  let server = null;
  let websocketServerModule = null;

  try {
    const userCandidates = [
      process.env.WEBSOCKET_SMOKE_USER_EMAIL,
      'abyfield@4vdataconsulting.com',
      'andrei.byfield@gmail.com',
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());

    const { data: candidateUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, tenant_id, role')
      .in('email', userCandidates);

    if (usersError) {
      throw usersError;
    }

    selectedUser =
      userCandidates
        .map((email) => candidateUsers?.find((u) => (u.email || '').toLowerCase() === email))
        .find(Boolean) || null;

    if (!selectedUser?.id || !selectedUser?.tenant_id) {
      t.skip(
        'No configured smoke-test user found. Expected one of: abyfield@4vdataconsulting.com, andrei.byfield@gmail.com',
      );
      return;
    }

    const token = jwt.sign(
      {
        sub: selectedUser.id,
        email: selectedUser.email,
        role: selectedUser.role,
        tenant_id: selectedUser.tenant_id,
      },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' },
    );

    websocketServerModule = await import(`../../lib/websocketServer.js?ts=${Date.now()}`);
    server = createServer((_req, res) => res.end('ok'));
    websocketServerModule.default.init(server);

    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });

    const { port } = server.address();
    socket = createClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      withCredentials: true,
      auth: { token },
      extraHeaders: {
        Cookie: `aisha_access=${token}`,
      },
    });

    await waitForSocketConnected(socket);

    const alertPromise = waitForEvent(socket, 'support_friction_alert');
    socket.emit('support_interaction', { eventType: 'navigation', path: '/contacts' });
    for (let i = 0; i < 6; i += 1) {
      socket.emit('support_interaction', { eventType: 'click', path: '/contacts' });
    }

    const alert = await alertPromise;
    assert.equal(alert.alertType, 'rage_click');
    assert.equal(alert.userId, selectedUser.id);
    assert.equal(alert.tenantId, selectedUser.tenant_id);
    assert.equal(alert.path, '/contacts');
    assert.equal('userEmail' in alert, false);
    assert.equal('userRole' in alert, false);
  } finally {
    if (socket) {
      socket.disconnect();
    }
    if (websocketServerModule?.default?.close) {
      await websocketServerModule.default.close();
    }
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    process.env.SUPABASE_URL = prevSupabaseUrl;
    process.env.JWT_SECRET = prevJwtSecret;
    process.env.SUPPORT_INTELLIGENCE_ENABLED = prevSupportIntelligence;
  }
});
