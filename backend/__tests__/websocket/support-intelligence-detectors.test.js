import assert from 'node:assert/strict';
import test from 'node:test';

async function loadDetectorModule() {
  const prevSupabaseUrl = process.env.SUPABASE_URL;
  const prevSupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevSupportFlag = process.env.SUPPORT_INTELLIGENCE_ENABLED;

  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
  process.env.SUPPORT_INTELLIGENCE_ENABLED = 'true';

  const mod = await import(`../../lib/websocketServer.js?ts=${Date.now()}-${Math.random()}`);

  process.env.SUPABASE_URL = prevSupabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupabaseServiceKey;
  process.env.SUPPORT_INTELLIGENCE_ENABLED = prevSupportFlag;

  return mod;
}

function buildRecentClicks(nowMs, count, spacingMs) {
  return Array.from({ length: count }, (_, i) => nowMs - (count - i) * spacingMs);
}

test('rage_click triggers at threshold and respects cooldown', async () => {
  const { createSupportTelemetryState, detectSupportFriction, __supportIntelligenceConfig } =
    await loadDetectorModule();

  const state = createSupportTelemetryState(0);
  const now1 = 200_000;

  state.clickTimes = buildRecentClicks(
    now1,
    __supportIntelligenceConfig.RAGE_CLICK_THRESHOLD - 1,
    1,
  );
  const firstTrigger = detectSupportFriction(state, { eventType: 'click', path: '/contacts' }, now1);
  assert.equal(firstTrigger.length, 1);
  assert.equal(firstTrigger[0].alertType, 'rage_click');

  const blocked = detectSupportFriction(state, { eventType: 'click', path: '/contacts' }, now1 + 1);
  assert.equal(blocked.length, 0);

  const now2 = now1 + __supportIntelligenceConfig.RAGE_CLICK_COOLDOWN_MS + 50;
  state.clickTimes = buildRecentClicks(
    now2,
    __supportIntelligenceConfig.RAGE_CLICK_THRESHOLD - 1,
    1,
  );
  const secondTrigger = detectSupportFriction(state, { eventType: 'click', path: '/contacts' }, now2);
  assert.equal(secondTrigger.length, 1);
  assert.equal(secondTrigger[0].alertType, 'rage_click');
});

test('stuck_user triggers at dwell+click threshold and respects cooldown', async () => {
  const { createSupportTelemetryState, detectSupportFriction, __supportIntelligenceConfig } =
    await loadDetectorModule();

  const state = createSupportTelemetryState(0);
  const spacingMs = 2_500;
  const now1 = 220_000;

  state.path = '/leads';
  state.lastNavigationAt = 1;
  state.clickTimes = buildRecentClicks(
    now1,
    __supportIntelligenceConfig.STUCK_CLICK_THRESHOLD - 1,
    spacingMs,
  );

  const firstTrigger = detectSupportFriction(state, { eventType: 'click', path: '/leads' }, now1);
  assert.equal(firstTrigger.some((alert) => alert.alertType === 'stuck_user'), true);

  const blocked = detectSupportFriction(state, { eventType: 'click', path: '/leads' }, now1 + 100);
  assert.equal(blocked.some((alert) => alert.alertType === 'stuck_user'), false);

  const now2 = now1 + __supportIntelligenceConfig.STUCK_COOLDOWN_MS + 100;
  state.path = '/leads';
  state.lastNavigationAt = now2 - __supportIntelligenceConfig.STUCK_DWELL_MS - 1;
  state.clickTimes = buildRecentClicks(
    now2,
    __supportIntelligenceConfig.STUCK_CLICK_THRESHOLD - 1,
    spacingMs,
  );

  const secondTrigger = detectSupportFriction(state, { eventType: 'click', path: '/leads' }, now2);
  assert.equal(secondTrigger.some((alert) => alert.alertType === 'stuck_user'), true);
});
