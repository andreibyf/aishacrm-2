import { test, expect } from '@playwright/test';
import { FRONTEND_URL as _FRONTEND_URL, initE2EUi, navigate } from './helpers';

const REALTIME_TOKEN_PATH = '**/api/ai/realtime-token';
const REALTIME_CALL_URL = 'https://api.openai.com/v1/realtime/calls';

const mockPeerInitScript = () => {
  const mockStream = {
    getTracks() {
      return [{ stop() {} }];
    },
  };

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {},
      configurable: true,
      writable: true
    });
  }
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    value: async () => mockStream as unknown as MediaStream,
    configurable: true,
    writable: true
  });

  class MockDataChannel {
    readyState: 'connecting' | 'open' | 'closed' = 'connecting';
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;

    send(_: string) {}

    close() {
      this.readyState = 'closed';
      this.onclose?.();
    }
  }

  class MockRTCPeerConnection {
    connectionState: RTCPeerConnectionState = 'new';
    iceConnectionState: RTCIceConnectionState = 'new';
    onconnectionstatechange: (() => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    ontrack: ((event: RTCTrackEvent) => void) | null = null;
    ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
    private channel: MockDataChannel | null = null;

    addTrack() {}

    addEventListener() {}

    removeEventListener() {}

    async createOffer() {
      return { type: 'offer', sdp: 'v=0' } as RTCSessionDescriptionInit;
    }

    async setLocalDescription() {}

    async setRemoteDescription() {
      this.connectionState = 'connected';
      this.onconnectionstatechange?.();
      if (this.channel) {
        this.channel.readyState = 'open';
        this.channel.onopen?.();
      }
    }

    createDataChannel() {
      this.channel = new MockDataChannel();
      queueMicrotask(() => {
        if (!this.channel) return;
        this.channel.readyState = 'open';
        this.channel.onopen?.();
      });
      return this.channel as unknown as RTCDataChannel;
    }

    close() {
      this.connectionState = 'closed';
      this.onconnectionstatechange?.();
      this.channel?.close();
    }
  }

  // @ts-ignore - Override global constructor for the test runtime
  window.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;
};

const mockSupportInitScript = () => {
  localStorage.setItem('E2E_TEST_MODE', 'true');
  localStorage.setItem('selected_tenant_id', '6cb4c008-4847-426a-9a2e-918ad70e7b69');
  localStorage.setItem('tenant_id', '6cb4c008-4847-426a-9a2e-918ad70e7b69');
  localStorage.setItem('FORCE_MOCK_USER', 'true');
  localStorage.setItem('ENABLE_REALTIME_TELEMETRY_LOGS', 'true');
  (window as any).__e2eUser = { id: 'realtime-e2e', email: 'realtime@spec.test', role: 'superadmin', tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69' };
};

test.describe('@smoke Realtime voice toggle', () => {
  test('enables realtime mode, calls token endpoint, and shows LIVE indicator', async ({ page }) => {
    await initE2EUi(page);
    await page.addInitScript(mockSupportInitScript);
    await page.addInitScript(mockPeerInitScript);

    let tokenRequested = false;
    let sessionRequested = false;
    const telemetryConsole: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'info' && message.text().includes('[Realtime Telemetry]')) {
        telemetryConsole.push(message.text());
      }
    });

    await page.route(REALTIME_TOKEN_PATH, (route) => {
      tokenRequested = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ value: 'test-ephemeral-key' }),
      });
    });

    await page.route(REALTIME_CALL_URL, (route) => {
      sessionRequested = true;
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/sdp' },
        body: 'v=0\r\n',
      });
    });

    await navigate(page, '/');

    const closeSidebarButton = page.getByRole('button', { name: /Close assistant/i });
    const sidebarWasOpen = await closeSidebarButton.isVisible().catch(() => false);
    if (sidebarWasOpen) {
      await closeSidebarButton.click();
      await expect(closeSidebarButton).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    }

    const launcher = page.locator('#ai-avatar-launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const realtimeButton = page.getByRole('button', { name: /Realtime Voice/i }).first();
    await expect(realtimeButton).toBeEnabled();
    await realtimeButton.click();

    await expect(page.getByRole('button', { name: /Disable Realtime Voice/i })).toBeVisible();
    const liveIndicator = page.locator('[data-testid="ai-sidebar-root"]').getByText(/^Live$/i);
    await expect(liveIndicator).toBeVisible();

    await expect.poll(() => tokenRequested, { timeout: 5000 }).toBeTruthy();
    await expect.poll(() => sessionRequested, { timeout: 5000 }).toBeTruthy();
    await expect.poll(() => telemetryConsole.length, { timeout: 5000 }).toBeGreaterThan(0);
  });
});
