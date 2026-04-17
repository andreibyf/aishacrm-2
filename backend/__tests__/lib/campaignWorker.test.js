import test from 'node:test';
import assert from 'node:assert/strict';

import { isCampaignWorkerEnabled } from '../../lib/campaignWorker.js';

test('isCampaignWorkerEnabled returns true only for explicit true', () => {
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'true' }), true);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'false' }), false);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: 'TRUE' }), false);
  assert.equal(isCampaignWorkerEnabled({ CAMPAIGN_WORKER_ENABLED: '1' }), false);
  assert.equal(isCampaignWorkerEnabled({}), false);
  assert.equal(isCampaignWorkerEnabled(undefined), false);
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
