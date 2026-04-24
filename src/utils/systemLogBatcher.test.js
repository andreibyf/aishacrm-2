/**
 * Tests for systemLogBatcher hardening against the Cloudflare death spiral
 * observed in production logs:
 *
 *   16:39:18  8× POST /api/system-logs/bulk  (all 403 from Cloudflare WAF)
 *
 * Before the fix, three compounding bugs produced that burst:
 *  (1) ERROR-level logs bypassed batching entirely (immediate POST per entry).
 *  (2) 403 from Cloudflare wasn't recognized as a cooldown trigger — only 429.
 *  (3) On bulk failure, the batcher fell back to one-POST-per-ERROR, adding
 *      MORE requests exactly when the IP was already being firewalled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/api/core/httpClient', () => ({
  callBackendAPI: vi.fn(),
}));

describe('systemLogBatcher hardening', () => {
  let callBackendAPI;
  let enqueueSystemLog;
  let flushSystemLogs;
  let __resetBatcherForTest;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('@/api/core/httpClient');
    callBackendAPI = mod.callBackendAPI;
    callBackendAPI.mockReset();

    const batcher = await import('./systemLogBatcher.js');
    enqueueSystemLog = batcher.enqueueSystemLog;
    flushSystemLogs = batcher.flushSystemLogs;
    __resetBatcherForTest = batcher.__resetBatcherForTest;
    __resetBatcherForTest?.();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ERROR-level logs are batched with other entries (no immediate per-ERROR POST)', async () => {
    callBackendAPI.mockResolvedValue({ status: 'success' });

    // Emit 5 ERRORs in rapid succession — previously each one spawned its own
    // POST. With batching, they coalesce into the next scheduled flush.
    for (let i = 0; i < 5; i++) {
      enqueueSystemLog({ level: 'ERROR', message: `boom ${i}` });
    }

    // Before the flush window, nothing sent
    expect(callBackendAPI).toHaveBeenCalledTimes(0);

    // After the ERROR flush window (500ms), exactly one bulk POST with all 5
    await vi.advanceTimersByTimeAsync(600);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);
    expect(callBackendAPI.mock.calls[0][0]).toBe('system-logs/bulk');
    expect(callBackendAPI.mock.calls[0][2].entries).toHaveLength(5);
  });

  it('403 response puts batcher into cooldown — subsequent logs are dropped silently', async () => {
    callBackendAPI.mockRejectedValueOnce(new Error('HTTP 403 Forbidden'));

    enqueueSystemLog({ level: 'INFO', message: 'first' });
    await vi.advanceTimersByTimeAsync(2100);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);

    // Batcher now in cooldown — 10 new logs must NOT produce any new POSTs
    for (let i = 0; i < 10; i++) {
      enqueueSystemLog({ level: 'INFO', message: `dropped ${i}` });
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);
  });

  it('403 response does NOT trigger per-ERROR fallback POSTs', async () => {
    callBackendAPI.mockRejectedValueOnce(new Error('HTTP 403 Forbidden'));

    // 3 ERRORs in one batch — old code would fall back to 3 individual posts
    // when the bulk failed. Now the 403 triggers cooldown and fallback is skipped.
    enqueueSystemLog({ level: 'ERROR', message: 'e1' });
    enqueueSystemLog({ level: 'ERROR', message: 'e2' });
    enqueueSystemLog({ level: 'ERROR', message: 'e3' });

    await vi.advanceTimersByTimeAsync(600);
    // Only the single failed bulk attempt — no fallback singles
    expect(callBackendAPI).toHaveBeenCalledTimes(1);
  });

  it('minimum inter-flush interval prevents rapid re-flushing', async () => {
    callBackendAPI.mockResolvedValue({ status: 'success' });

    // First batch flushes
    enqueueSystemLog({ level: 'INFO', message: 'a' });
    await vi.advanceTimersByTimeAsync(2100);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);

    // Immediately enqueue more — should NOT flush within the min-interval
    enqueueSystemLog({ level: 'INFO', message: 'b' });
    await vi.advanceTimersByTimeAsync(200);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);

    // After min interval + flush window, second flush fires
    await vi.advanceTimersByTimeAsync(2000);
    expect(callBackendAPI).toHaveBeenCalledTimes(2);
  });

  it('circuit breaker: after 3 consecutive non-403 failures, enters silent-drop mode', async () => {
    callBackendAPI.mockRejectedValue(new Error('HTTP 500'));

    // Three flush cycles each with one failure — counter trips on the third
    for (let i = 0; i < 3; i++) {
      enqueueSystemLog({ level: 'INFO', message: `fail ${i}` });
      await vi.advanceTimersByTimeAsync(2100);
    }
    expect(callBackendAPI).toHaveBeenCalledTimes(3);

    // Breaker tripped — further logs must not produce POSTs
    for (let i = 0; i < 10; i++) {
      enqueueSystemLog({ level: 'INFO', message: `dropped ${i}` });
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(callBackendAPI).toHaveBeenCalledTimes(3);
  });

  it('a successful flush after a failure resets the consecutive-failure counter', async () => {
    callBackendAPI.mockRejectedValueOnce(new Error('HTTP 500'));
    enqueueSystemLog({ level: 'INFO', message: 'fail' });
    await vi.advanceTimersByTimeAsync(2100);

    callBackendAPI.mockResolvedValueOnce({ status: 'success' });
    enqueueSystemLog({ level: 'INFO', message: 'ok' });
    await vi.advanceTimersByTimeAsync(2100);

    // Counter reset — now exercise 2 more failures, breaker should NOT trip
    // (takes 3 consecutive, not cumulative)
    callBackendAPI.mockRejectedValue(new Error('HTTP 500'));
    for (let i = 0; i < 2; i++) {
      enqueueSystemLog({ level: 'INFO', message: `f ${i}` });
      await vi.advanceTimersByTimeAsync(2100);
    }
    expect(callBackendAPI).toHaveBeenCalledTimes(4);

    // Next enqueue still fires (breaker not tripped)
    enqueueSystemLog({ level: 'INFO', message: 'still trying' });
    await vi.advanceTimersByTimeAsync(2100);
    expect(callBackendAPI).toHaveBeenCalledTimes(5);
  });

  it('ERROR entry accelerates a pending long-delay flush to the 500ms window', async () => {
    callBackendAPI.mockResolvedValue({ status: 'success' });

    // An INFO first schedules a 2s flush
    enqueueSystemLog({ level: 'INFO', message: 'info' });

    // An ERROR arrives 100ms later — must shorten the flush to 500ms total
    // from the ERROR enqueue (i.e., not wait the full original 2s)
    await vi.advanceTimersByTimeAsync(100);
    enqueueSystemLog({ level: 'ERROR', message: 'boom' });

    // Advance to ERROR's intended window (100 + 500 = 600ms total). Flush
    // should have fired and included BOTH entries.
    await vi.advanceTimersByTimeAsync(550);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);
    expect(callBackendAPI.mock.calls[0][2].entries).toHaveLength(2);
  });

  it('happy path: batched INFO logs flush on interval, exactly once per batch', async () => {
    callBackendAPI.mockResolvedValue({ status: 'success' });

    for (let i = 0; i < 4; i++) {
      enqueueSystemLog({ level: 'INFO', message: `m ${i}` });
    }
    // Default INFO flush is 2s
    await vi.advanceTimersByTimeAsync(2100);
    expect(callBackendAPI).toHaveBeenCalledTimes(1);
    expect(callBackendAPI.mock.calls[0][2].entries).toHaveLength(4);
  });
});
