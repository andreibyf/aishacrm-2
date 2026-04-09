const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run refresh with short retry passes to absorb cache invalidation latency.
 * Useful after mutations where data can lag briefly across layers.
 */
export async function runMutationRefresh(refreshFn, options = {}) {
  const { passes = 2, initialDelayMs = 120, stepDelayMs = 180, maxDelayMs = 600 } = options;

  if (typeof refreshFn !== 'function') {
    throw new Error('runMutationRefresh requires a refresh function');
  }

  for (let i = 0; i < passes; i += 1) {
    const delay = i === 0 ? initialDelayMs : Math.min(initialDelayMs + stepDelayMs * i, maxDelayMs);
    if (delay > 0) {
      await sleep(delay);
    }
    await refreshFn();
  }
}
