import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasCampaignWorkerSupabaseConfig,
  isCampaignWorkerEnabled,
} from '../../lib/campaignWorker.js';

test('isCampaignWorkerEnabled returns true only for explicit true', () => {
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'true' }), true);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'false' }), false);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'TRUE' }), false);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: '1' }), false);
  assert.equal(isCampaignWorkerEnabled({}), false);
  assert.equal(isCampaignWorkerEnabled(undefined), false);
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
