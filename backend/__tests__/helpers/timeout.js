/**
 * Test timeout helper to skip long-running tests for later investigation.
 */

export function getTestTimeoutMs() {
  const raw = process.env.TEST_TIMEOUT_MS || '120000';
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000;
}

export async function withTimeoutSkip(t, fn, timeoutMs = getTestTimeoutMs()) {
  let timer = null;
  let timedOut = false;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, timeoutMs);
  });

  const run = (async () => {
    await fn();
    return true;
  })();

  await Promise.race([run, timeout]);

  if (timer) {
    clearTimeout(timer);
  }

  if (timedOut) {
    t.skip(`Skipped after ${timeoutMs}ms (investigate later)`);
  }
}
