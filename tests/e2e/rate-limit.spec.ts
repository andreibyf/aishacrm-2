import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

// Mark as slow; skip when RATE_LIMIT_SKIP is set
const shouldSkip = process.env.RATE_LIMIT_SKIP === '1';

(test.skip(shouldSkip, 'Skipping rate limit test when RATE_LIMIT_SKIP=1') ? test.skip : test)('Rate limiting returns 429 after threshold', async ({ request }) => {
  // Send a burst of requests to /api/health
  const max = 120; // above default 100/min
  let got429 = false;

  for (let i = 0; i < max; i++) {
    const res = await request.get(`${BACKEND_URL}/api/health`).catch(() => ({ status: () => 0 } as any));
    if (res && res.status && res.status() === 429) {
      got429 = true;
      break;
    }
  }

  expect(got429).toBeTruthy();
});
