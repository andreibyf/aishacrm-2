import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';

// Mark as slow; skip when RATE_LIMIT_SKIP is set
const shouldSkip = process.env.RATE_LIMIT_SKIP === '1';

const testFn = shouldSkip ? test.skip : test;
testFn('Rate limiting returns 429 after threshold', async ({ request }) => {
  // Send a burst of requests to a public API endpoint subject to rate limiting
  // /api/metrics/performance doesn't require auth and is not in the rateSkip exemption list
  // Backend default: RATE_LIMIT_MAX=120, so we need 121+ requests to trigger 429
  const max = 125; // above default 120/min threshold
  let got429 = false;
  let statusCounts: Record<number, number> = {};

  for (let i = 0; i < max; i++) {
    try {
      const res = await request.get(`${BACKEND_URL}/api/metrics/performance`);
      const status = res.status();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      if (status === 429) {
        console.log(`✓ Got 429 after ${i + 1} requests. Status breakdown:`, statusCounts);
        got429 = true;
        break;
      }
    } catch (err: any) {
      console.error(`Request ${i + 1} failed:`, err.message);
    }
  }

  if (!got429) {
    console.error(`❌ No 429 received after ${max} requests. Status breakdown:`, statusCounts);
    console.error(`Backend URL: ${BACKEND_URL}`);
    console.error(`Check if RATE_LIMIT_MAX is set too high or rate limiting is disabled`);
  }

  expect(got429).toBeTruthy();
});
