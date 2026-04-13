import assert from 'node:assert/strict';
import test from 'node:test';

async function loadWebsocketModule() {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
  return import(`../../lib/websocketServer.js?ts=${Date.now()}-${Math.random()}`);
}

test('resolveSocketAuthToken prefers aisha_access cookie and falls back to handshake auth', async () => {
  const { resolveSocketAuthToken } = await loadWebsocketModule();

  const fromCookie = resolveSocketAuthToken({
    headers: {
      cookie: 'foo=bar; aisha_access=jwt-cookie-token; other=value',
    },
    auth: { token: 'jwt-auth-token' },
  });
  assert.equal(fromCookie, 'jwt-cookie-token');

  const fromAuth = resolveSocketAuthToken({
    headers: { cookie: 'foo=bar' },
    auth: { token: 'jwt-auth-token' },
  });
  assert.equal(fromAuth, 'jwt-auth-token');

  const missing = resolveSocketAuthToken({ headers: { cookie: 'foo=bar' }, auth: {} });
  assert.equal(missing, null);
});

test('resolveSocketUserId supports standard auth payload shapes', async () => {
  const { resolveSocketUserId } = await loadWebsocketModule();

  assert.equal(resolveSocketUserId({ sub: 'user-sub' }), 'user-sub');
  assert.equal(resolveSocketUserId({ userId: 'user-id' }), 'user-id');
  assert.equal(resolveSocketUserId({ user_id: 'user_id' }), 'user_id');
  assert.equal(resolveSocketUserId({ id: 'id-field' }), 'id-field');
  assert.equal(resolveSocketUserId({}), null);
});
