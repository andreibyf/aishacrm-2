export function trackRealtimeEvent(params: {
  event: string;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
  severity?: 'info' | 'warn' | 'error';
}): void;

export function trackConnectionStateChange(params: {
  from: string;
  to: string;
  reason?: string;
  context?: Record<string, unknown>;
}): void;

export function subscribeToRealtimeTelemetry(
  listener: (entries: unknown[]) => void
): () => void;

export function getRealtimeTelemetrySnapshot(): unknown[];

export function clearRealtimeTelemetry(): void;
