/**
 * AiSidebar window features — 4VD-26 / 4VD-45
 *
 * Tests minimize, pop-out, and resize-handle behaviours added to AiSidebar.
 * The component has many heavy deps so they are all mocked below.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── Heavy dep mocks ─────────────────────────────────────────────────────────

vi.mock('@/components/ai/useAiSidebarState.jsx', () => ({
  useAiSidebarState: () => ({
    isOpen: true,
    closeSidebar: vi.fn(),
    resetThread: vi.fn(),
    messages: [],
    isSending: false,
    error: null,
    clearError: vi.fn(),
    sendMessage: vi.fn(),
    addRealtimeMessage: vi.fn(),
    setRealtimeMode: vi.fn(),
    suggestions: [],
    applySuggestion: vi.fn(),
    isDeveloperMode: false,
    setIsDeveloperMode: vi.fn(),
    conversationId: null,
  }),
}));

vi.mock('@/components/ai/useSpeechInput.js', () => ({
  useSpeechInput: () => ({
    isListening: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    transcript: '',
    error: null,
    interimTranscript: '',
  }),
}));

vi.mock('@/components/ai/useSpeechOutput.js', () => ({
  useSpeechOutput: () => ({
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
    isSpeaking: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useRealtimeAiSHA.js', () => ({
  useRealtimeAiSHA: () => ({
    isConnected: false,
    isConnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendAudio: vi.fn(),
    error: null,
    startSession: vi.fn(),
    endSession: vi.fn(),
    sendText: vi.fn(),
    isSessionActive: false,
    isMicActive: false,
    startMic: vi.fn(),
    stopMic: vi.fn(),
    isInitializing: false,
  }),
}));

vi.mock('@/hooks/usePushToTalkKeybinding.js', () => ({
  usePushToTalkKeybinding: () => ({ isActive: false }),
}));

vi.mock('@/hooks/useWakeWordDetection.js', () => ({
  useWakeWordDetection: () => ({
    isEnabled: false,
    status: 'idle',
    enable: vi.fn(),
    disable: vi.fn(),
    wakeWordStatus: 'idle',
  }),
}));

vi.mock('@/components/shared/ConfirmDialog.jsx', () => ({
  useConfirmDialog: () => ({
    ConfirmDialog: () => null,
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/components/shared/useUser.js', () => ({
  useUser: () => ({ user: { email: 'test@example.com', role: 'admin' } }),
}));

vi.mock('@/utils/realtimeTelemetry.js', () => ({
  trackRealtimeEvent: vi.fn(),
  subscribeToRealtimeTelemetry: vi.fn(() => () => {}),
  getRealtimeTelemetrySnapshot: vi.fn(() => []),
}));

vi.mock('@/components/ai/ConversationalForm.jsx', () => ({
  default: () => null,
}));

vi.mock('@/components/ai/conversationalForms', () => ({
  listConversationalSchemas: () => [],
  getSchemaById: () => null,
}));

vi.mock('@/api/entities', () => ({
  Account: { create: vi.fn() },
  Activity: { create: vi.fn() },
  Contact: { create: vi.fn() },
  Lead: { create: vi.fn() },
  Opportunity: { create: vi.fn() },
  BizDevSource: { create: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/ambiguityResolver', () => ({
  isLikelyVoiceGarble: () => false,
  sanitizeMessageText: (t) => t,
}));

vi.mock('@/api/conversations', () => ({
  submitFeedback: vi.fn().mockResolvedValue({}),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }) => <>{children}</>,
}));

vi.mock('@/components/ai/RealtimeIndicator.jsx', () => ({
  default: () => null,
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import AiSidebar from '../AiSidebar.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  return render(<AiSidebar realtimeVoiceEnabled={false} />);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AiSidebar window features (4VD-26 / 4VD-45)', () => {
  beforeEach(() => {
    // Suppress known telemetry console noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Clear sessionStorage between tests
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the sidebar root element', () => {
    renderSidebar();
    expect(screen.getByTestId('ai-sidebar-root')).toBeDefined();
  });

  it('minimize button is present in the header', () => {
    renderSidebar();
    const minBtn = screen.getByRole('button', { name: /minimize panel/i });
    expect(minBtn).toBeDefined();
  });

  it('pop-out button is present in the header', () => {
    renderSidebar();
    const popBtn = screen.getByRole('button', { name: /pop out panel/i });
    expect(popBtn).toBeDefined();
  });

  it('resize handle is present in the DOM', () => {
    const { container } = renderSidebar();
    const handle = container.querySelector('.sidebar-resize-handle');
    expect(handle).not.toBeNull();
  });

  it('clicking minimize adds "minimized" class to sidebar root', () => {
    renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');
    const minBtn = screen.getByRole('button', { name: /minimize panel/i });

    expect(root.className).not.toContain('minimized');
    act(() => {
      fireEvent.click(minBtn);
    });
    expect(root.className).toContain('minimized');
  });

  it('minimized strip becomes visible after minimizing', () => {
    const { container } = renderSidebar();
    const minBtn = screen.getByRole('button', { name: /minimize panel/i });

    act(() => {
      fireEvent.click(minBtn);
    });
    const strip = container.querySelector('.sidebar-minimized-strip');
    expect(strip).not.toBeNull();
  });

  it('clicking restore button on minimized strip removes "minimized" class', () => {
    renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');
    const minBtn = screen.getByRole('button', { name: /minimize panel/i });

    act(() => {
      fireEvent.click(minBtn);
    });
    expect(root.className).toContain('minimized');

    const restoreBtn = screen.getByRole('button', { name: /restore aisha panel/i });
    act(() => {
      fireEvent.click(restoreBtn);
    });
    expect(root.className).not.toContain('minimized');
  });

  it('clicking pop-out adds "popped-out" class to sidebar root', () => {
    renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');
    const popBtn = screen.getByRole('button', { name: /pop out panel/i });

    expect(root.className).not.toContain('popped-out');
    act(() => {
      fireEvent.click(popBtn);
    });
    expect(root.className).toContain('popped-out');
  });

  it('popped-out panel renders drag handle', () => {
    renderSidebar();
    const popBtn = screen.getByRole('button', { name: /pop out panel/i });

    act(() => {
      fireEvent.click(popBtn);
    });
    // Drag handle is identified by its title attribute
    const dragHandle = document.querySelector('[title="Drag to move"]');
    expect(dragHandle).not.toBeNull();
  });

  it('clicking "Dock panel" when popped out removes popped-out class', () => {
    renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');

    // pop out
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /pop out panel/i }));
    });
    expect(root.className).toContain('popped-out');

    // dock
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /dock panel/i }));
    });
    expect(root.className).not.toContain('popped-out');
  });

  it('resize mousedown + mousemove widens the panel', () => {
    const { container } = renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');
    const handle = container.querySelector('.sidebar-resize-handle');

    // Start with default width (540)
    // Simulate drag 100px to the left — panel should grow by ~100
    act(() => {
      fireEvent.mouseDown(handle, { clientX: 500 });
      fireEvent.mouseMove(document, { clientX: 400 }); // moved 100px left → wider
    });

    // After drag, --sidebar-w CSS var should reflect new width
    const cssVar = root.style.getPropertyValue('--sidebar-w');
    const newWidth = parseInt(cssVar, 10);
    expect(newWidth).toBeGreaterThan(540);
    expect(newWidth).toBeGreaterThanOrEqual(320);
    expect(newWidth).toBeLessThanOrEqual(900);
  });

  it('panel width is clamped to minimum 320px on resize', () => {
    const { container } = renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');
    const handle = container.querySelector('.sidebar-resize-handle');

    act(() => {
      fireEvent.mouseDown(handle, { clientX: 500 });
      // Drag far right — would make width very small
      fireEvent.mouseMove(document, { clientX: 1400 });
    });

    const cssVar = root.style.getPropertyValue('--sidebar-w');
    expect(parseInt(cssVar, 10)).toBeGreaterThanOrEqual(320);
  });

  it('panel width is persisted to sessionStorage on mouseup after resize', () => {
    const { container } = renderSidebar();
    const handle = container.querySelector('.sidebar-resize-handle');

    act(() => {
      fireEvent.mouseDown(handle, { clientX: 500 });
      fireEvent.mouseMove(document, { clientX: 400 });
      fireEvent.mouseUp(document);
    });

    const stored = sessionStorage.getItem('aisha:sidebar:width');
    expect(stored).not.toBeNull();
    expect(parseInt(stored, 10)).toBeGreaterThan(0);
  });

  it('backdrop is hidden when panel is minimized', () => {
    const { container } = renderSidebar();
    const minimizeBtn = screen.getByLabelText('Minimize panel');
    act(() => {
      fireEvent.click(minimizeBtn);
    });
    expect(container.querySelector('.sidebar-backdrop')).toBeNull();
  });

  it('backdrop is hidden when panel is popped out', () => {
    const { container } = renderSidebar();
    const popoutBtn = screen.getByRole('button', { name: /pop out panel/i });
    act(() => {
      fireEvent.click(popoutBtn);
    });
    expect(container.querySelector('.sidebar-backdrop')).toBeNull();
  });

  it('clamps stored width to current viewport on initial load', () => {
    // Persist an oversized width (e.g. saved on a wide monitor)
    sessionStorage.setItem('aisha:sidebar:width', '1400');
    // Shrink the viewport before render so the stored value exceeds it
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 800,
    });

    try {
      renderSidebar();
      const root = screen.getByTestId('ai-sidebar-root');
      const cssVar = root.style.getPropertyValue('--sidebar-w');
      const applied = parseInt(cssVar, 10);

      // Must be clamped to <= min(900, vw - 60) = min(900, 740) = 740
      expect(applied).toBeLessThanOrEqual(740);
      // Must not be below the 320 floor
      expect(applied).toBeGreaterThanOrEqual(320);
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalWidth,
      });
    }
  });

  it('re-clamps panel width when the viewport shrinks below current width', () => {
    sessionStorage.setItem('aisha:sidebar:width', '800');
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1200,
    });

    try {
      renderSidebar();
      const root = screen.getByTestId('ai-sidebar-root');
      const initial = parseInt(root.style.getPropertyValue('--sidebar-w'), 10);
      expect(initial).toBe(800);

      // Now shrink viewport and dispatch resize
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 600,
      });
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      const after = parseInt(root.style.getPropertyValue('--sidebar-w'), 10);
      // After resize the panel must fit within viewport - 60 = 540
      expect(after).toBeLessThanOrEqual(540);
      expect(after).toBeGreaterThanOrEqual(320);
      // sessionStorage is updated with the clamped value
      expect(parseInt(sessionStorage.getItem('aisha:sidebar:width'), 10)).toBe(after);
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalWidth,
      });
    }
  });

  it('minimizing from popped-out state removes popped-out class and adds minimized class', () => {
    renderSidebar();
    const root = screen.getByTestId('ai-sidebar-root');

    // Pop out first
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /pop out panel/i }));
    });
    expect(root.className).toContain('popped-out');
    expect(root.className).not.toContain('minimized');

    // Minimize from popped-out state
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /minimize panel/i }));
    });

    // Strip must be docked: popped-out gone, minimized present
    expect(root.className).not.toContain('popped-out');
    expect(root.className).toContain('minimized');
  });
});
