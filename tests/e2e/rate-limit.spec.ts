import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

// Mark as slow; skip when RATE_LIMIT_SKIP is set
const shouldSkip = process.env.RATE_LIMIT_SKIP === '1';

const testFn = shouldSkip ? test.skip : test;
testFn('Rate limiting returns 429 after threshold', async ({ request }) => {
  // Send a burst of requests to a public API endpoint subject to rate limiting
  // /api/metrics/performance doesn't require auth and is not in the rateSkip exemption list
  // Backend default: RATE_LIMIT_MAX=120, so we need 121+ requests to trigger 429
  const max = 125; // above default 120/min threshold
  let got429 = false;

  for (let i = 0; i < max; i++) {
    const res = await request.get(`${BACKEND_URL}/api/metrics/performance`).catch(() => ({ status: () => 0 } as any));
    const status = res && res.status ? res.status() : 0;
    if (status === 429) {
      got429 = true;
      break;
    }
  }

  expect(got429).toBeTruthy();
});
