import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  trackRealtimeEvent,
  trackConnectionStateChange,
  subscribeToRealtimeTelemetry,
  getRealtimeTelemetrySnapshot,
  clearRealtimeTelemetry
} from '../../utils/realtimeTelemetry.js';

describe('realtimeTelemetry utilities', () => {
  beforeEach(() => {
    clearRealtimeTelemetry();
  });

  it('stores sanitized realtime events in the buffer', () => {
    trackRealtimeEvent({
      event: 'test.event',
      payload: {
        message: 'a'.repeat(120),
        count: 3
      },
      context: {
        tenantId: 'tenant-123',
        userId: 'user@example.com',
        surface: 'TestSurface'
      }
    });

    const snapshot = getRealtimeTelemetrySnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].event).toBe('test.event');
    expect(snapshot[0].payload.message.endsWith('...')).toBe(true);
    expect(snapshot[0].context.tenantId).toBe('tenant-123');
    expect(snapshot[0].context.userId).toBe('user@example.com');
  });

  it('notifies subscribers when new events arrive and unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToRealtimeTelemetry(listener);
    expect(listener).toHaveBeenCalledWith([]);

    trackConnectionStateChange({ from: 'idle', to: 'connected', reason: 'test' });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    trackRealtimeEvent({ event: 'after.unsubscribe' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
