import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import Tracker from '@openreplay/tracker';
import { useOpenReplay } from '@/hooks/useOpenReplay';
import { shouldDisableSecureMode } from '@/utils/runtimeEnv';

vi.mock('@openreplay/tracker', () => ({
  default: vi.fn(),
}));

vi.mock('@openreplay/tracker-assist', () => ({
  default: vi.fn(() => ({ name: 'assist-plugin' })),
}));

describe('[PLATFORM] useOpenReplay', () => {
  let trackerInstance;
  let originalRuntimeEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_OPENREPLAY_PROJECT_KEY', 'build-time-project-key');
    vi.stubEnv('VITE_OPENREPLAY_INGEST_POINT', 'https://build-time.ingest.example');

    trackerInstance = {
      use: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      getSessionURL: vi.fn(() => 'https://app.openreplay.com/session/test'),
      setUserID: vi.fn(),
      setMetadata: vi.fn(),
      event: vi.fn(),
    };
    Tracker.mockImplementation(function TrackerMock() {
      return trackerInstance;
    });

    originalRuntimeEnv = window._env_;
    window._env_ = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window._env_ = originalRuntimeEnv;
  });

  it('prefers runtime window._env_ values over build-time Vite env', () => {
    window._env_ = {
      VITE_OPENREPLAY_PROJECT_KEY: 'runtime-project-key',
      VITE_OPENREPLAY_INGEST_POINT: 'https://runtime.ingest.example',
    };

    renderHook(() => useOpenReplay());

    expect(Tracker).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: 'runtime-project-key',
        ingestPoint: 'https://runtime.ingest.example',
      }),
    );
  });

  it('enables insecure mode for http localhost even when dev mode is false', () => {
    expect(
      shouldDisableSecureMode({
        isDev: false,
        location: { protocol: 'http:', hostname: 'localhost' },
      }),
    ).toBe(true);

    expect(
      shouldDisableSecureMode({
        isDev: false,
        location: { protocol: 'http:', hostname: '127.0.0.1' },
      }),
    ).toBe(true);
  });
});
