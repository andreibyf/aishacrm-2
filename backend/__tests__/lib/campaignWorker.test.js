import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import {
  __resetGetSupabaseClientForTest,
  __setGetSupabaseClientForTest,
  hasCampaignWorkerSupabaseConfig,
  isCampaignWorkerEnabled,
  startCampaignWorker,
  stopCampaignWorker,
} from '../../lib/campaignWorker.js';

test('isCampaignWorkerEnabled returns true only for explicit true', () => {
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'true' }), true);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'false' }), false);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'TRUE' }), false);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: '1' }), false);
  assert.equal(isCampaignWorkerEnabled({}), false);
  // Pass explicit empty object instead of undefined to avoid using process.env default
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: undefined }), false);
});

test('hasCampaignWorkerSupabaseConfig requires both Supabase env vars', () => {
  assert.equal(
    hasCampaignWorkerSupabaseConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    }),
    true,
  );
  assert.equal(
    hasCampaignWorkerSupabaseConfig({
      SUPABASE_URL: 'https://example.supabase.co',
    }),
    false,
  );
  assert.equal(
    hasCampaignWorkerSupabaseConfig({
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    }),
    false,
  );
  assert.equal(hasCampaignWorkerSupabaseConfig({}), false);
});

test('campaign worker enablement helper ignores unrelated env values', () => {
  assert.equal(
    isCampaignWorkerEnabled({
      CAMPAIGN_WORKER_INTERVAL_MS: '5000',
      NODE_ENV: 'development',
    }),
    false,
  );
});

test('startCampaignWorker does not initialize Supabase when config is missing', () => {
  const originalEnv = { ...process.env };
  const getClientSpy = mock.fn(() => {
    throw new Error('getSupabaseClient should not be called without config');
  });

  __setGetSupabaseClientForTest(getClientSpy);
  process.env.CAMPAIGN_WORKER_ENABLED = 'true';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    assert.doesNotThrow(() => startCampaignWorker(null, 5));
    assert.equal(getClientSpy.mock.calls.length, 0);
  } finally {
    stopCampaignWorker();
    __resetGetSupabaseClientForTest();
    process.env = originalEnv;
  }
});
