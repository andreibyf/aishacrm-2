import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AiSidebar from '../AiSidebar.jsx';
const mockSendMessage = vi.fn();
const speechState = {
  transcript: '',
  isRecording: false,
  isTranscribing: false,
  error: null,
  startRecording: vi.fn(),
  stopRecording: vi.fn()
};
let triggerFinalTranscript = null;
let mockSidebarState;
const mockPlayText = vi.fn();
const mockStopPlayback = vi.fn();
const mockConnectRealtime = vi.fn();
const mockDisconnectRealtime = vi.fn();
const mockRealtimeSend = vi.fn();
let realtimeHookState;
const mockTrackRealtimeEvent = vi.fn();
const mockSubscribeTelemetry = vi.fn();
const mockUnsubscribe = vi.fn();
const telemetrySnapshot = [];
const mockConfirm = vi.fn(() => Promise.resolve(true));
const MockConfirmDialog = () => null;

vi.mock('@/components/shared/ConfirmDialog.jsx', () => ({
  useConfirmDialog: () => ({
    ConfirmDialog: MockConfirmDialog,
    confirm: mockConfirm,
  }),
}));

vi.mock('@/hooks/useRealtimeAiSHA.js', () => ({
  useRealtimeAiSHA: () => realtimeHookState
}));

vi.mock('@/utils/realtimeTelemetry.js', () => ({
  trackRealtimeEvent: (...args) => mockTrackRealtimeEvent(...args),
  subscribeToRealtimeTelemetry: (listener) => {
    mockSubscribeTelemetry(listener);
    return () => mockUnsubscribe(listener);
  },
  getRealtimeTelemetrySnapshot: () => telemetrySnapshot
}));

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

const buildSidebarState = (overrides = {}) => ({
  isOpen: true,
  closeSidebar: vi.fn(),
  resetThread: vi.fn(),
  messages: [
    { id: 'welcome', role: 'assistant', content: 'Hello from AiSHA' }
  ],
  isSending: false,
  error: null,
  clearError: vi.fn(),
  sendMessage: mockSendMessage,
  setRealtimeMode: vi.fn(),
  suggestions: [],
  applySuggestion: vi.fn(() => ''),
  ...overrides
});

vi.mock('../useAiSidebarState.jsx', () => ({
  useAiSidebarState: () => mockSidebarState
}));

vi.mock('../useSpeechInput.js', () => ({
  useSpeechInput: (options = {}) => {
    triggerFinalTranscript = options?.onFinalTranscript || null;
    return speechState;
  }
}));

vi.mock('../useSpeechOutput.js', () => ({
  useSpeechOutput: () => ({
    playText: mockPlayText,
    stopPlayback: mockStopPlayback,
    isLoading: false,
    isPlaying: false,
    error: null
  })
}));

describe('AiSidebar voice', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    speechState.transcript = '';
    triggerFinalTranscript = null;
    speechState.startRecording.mockReset();
    speechState.stopRecording.mockReset();
    mockPlayText.mockReset();
    mockStopPlayback.mockReset();
    mockTrackRealtimeEvent.mockReset();
    mockConnectRealtime.mockReset();
    mockDisconnectRealtime.mockReset();
    mockRealtimeSend.mockReset();
    mockSubscribeTelemetry.mockReset();
    mockUnsubscribe.mockReset();
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
    mockConnectRealtime.mockResolvedValue(true);
    mockRealtimeSend.mockResolvedValue(true);
    mockSidebarState = buildSidebarState();
    realtimeHookState = {
      isSupported: true,
      isInitializing: false,
      isConnecting: false,
      isConnected: true,
      isListening: true,
      isLive: true,
      error: null,
      errorDetails: null,
      connectRealtime: mockConnectRealtime,
      startSession: mockConnectRealtime,
      sendUserMessage: mockRealtimeSend,
      disconnectRealtime: mockDisconnectRealtime,
      stopSession: mockDisconnectRealtime,
      messages: [],
    };
  });

  it('calls /api/ai/tts when Listen clicked', async () => {
    render(<AiSidebar />);

    const listenButton = await screen.findByRole('button', { name: /Play voice/i });
    fireEvent.click(listenButton);

    await waitFor(() => {
      expect(mockPlayText).toHaveBeenCalledWith('Hello from AiSHA');
    });
  });

  it('auto-sends safe voice transcripts returned by STT', async () => {
    render(<AiSidebar />);
    expect(triggerFinalTranscript).toBeInstanceOf(Function);

    act(() => {
      triggerFinalTranscript?.('show me my leads');
    });

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('show me my leads', {
        origin: 'voice',
        autoSend: true
      });
    });
  });

  it('blocks destructive voice transcripts returned by STT', async () => {
    render(<AiSidebar />);

    act(() => {
      triggerFinalTranscript?.('delete all contacts right now');
    });

    await waitFor(() => expect(screen.getByText(/Voice command blocked/i)).toBeInTheDocument());
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('auto-plays assistant responses that follow voice-origin messages', async () => {
    mockSidebarState = buildSidebarState({
      messages: [
        {
          id: 'user-voice',
          role: 'user',
          content: 'What are my leads?',
          metadata: { origin: 'voice' }
        },
        {
          id: 'assistant-reply',
          role: 'assistant',
          content: 'You have 12 open leads.'
        }
      ]
    });

    render(<AiSidebar />);

    await waitFor(() => {
      expect(mockPlayText).toHaveBeenCalledWith('You have 12 open leads.');
    });
  });

  it('starts and stops recording with press-to-talk pointer interactions', async () => {
    render(<AiSidebar />);
    const voiceButton = await screen.findByTestId('press-to-talk-button');

    fireEvent.pointerDown(voiceButton);
    expect(speechState.startRecording).toHaveBeenCalled();

    fireEvent.pointerUp(voiceButton);
    expect(speechState.stopRecording).toHaveBeenCalled();
  });

  it('emits telemetry events when realtime toggle is used', async () => {
    render(<AiSidebar />);

    const toggleButton = await screen.findByRole('button', { name: /Realtime Voice/i });

    await act(async () => {
      fireEvent.click(toggleButton);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockConnectRealtime).toHaveBeenCalled();
    });

    expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ui.realtime.toggle',
      payload: expect.objectContaining({ enabled: true, phase: 'request' })
    }));

    await waitFor(() => {
      expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
        event: 'ui.realtime.toggle',
        payload: expect.objectContaining({ enabled: true, phase: 'success' })
      }));
    });

    await act(async () => {
      fireEvent.click(toggleButton);
    });

    await waitFor(() => {
      expect(mockDisconnectRealtime).toHaveBeenCalled();
    });
    expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ui.realtime.toggle',
      payload: expect.objectContaining({ enabled: false, phase: 'success' })
    }));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('logs telemetry when destructive voice commands are blocked', async () => {
    render(<AiSidebar />);

    act(() => {
      triggerFinalTranscript?.('delete all accounts now');
    });

    await waitFor(() => expect(screen.getByText(/Voice command blocked/i)).toBeInTheDocument());
    expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ui.voice.blocked',
      payload: expect.objectContaining({ reason: 'dangerous_phrase' })
    }));
  });

  it('renders actionable realtime error hints from hook details', async () => {
    realtimeHookState = {
      ...realtimeHookState,
      error: 'Microphone access was blocked.',
      errorDetails: {
        code: 'mic_denied',
        message: 'Microphone access was blocked.',
        hint: 'Allow microphone access from the browser toolbar.',
        suggestions: ['Click the lock icon and enable microphone.'],
      },
    };

    render(<AiSidebar />);

    expect(await screen.findByText('Microphone access was blocked.')).toBeInTheDocument();
    expect(screen.getByText('Allow microphone access from the browser toolbar.')).toBeInTheDocument();
    expect(screen.getByText('Click the lock icon and enable microphone.')).toBeInTheDocument();
  });

  it('requires confirmation before disabling realtime voice', async () => {
    render(<AiSidebar />);
    const toggleButton = await screen.findByRole('button', { name: /Realtime Voice/i });

    await act(async () => {
      fireEvent.click(toggleButton);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(toggleButton);
    });

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    await waitFor(() => expect(mockDisconnectRealtime).toHaveBeenCalled());
  });

  it('keeps realtime session active when disable confirmation is cancelled', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    render(<AiSidebar />);
    const toggleButton = await screen.findByRole('button', { name: /Realtime Voice/i });

    await act(async () => {
      fireEvent.click(toggleButton);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(toggleButton);
    });

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockDisconnectRealtime).not.toHaveBeenCalled();
  });

  it('auto-disables realtime mode when the connection drops unexpectedly', async () => {
    const { rerender } = render(<AiSidebar />);
    const toggleButton = await screen.findByRole('button', { name: /Realtime Voice/i });

    await act(async () => {
      fireEvent.click(toggleButton);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    mockDisconnectRealtime.mockClear();
    act(() => {
      realtimeHookState = {
        ...realtimeHookState,
        isConnected: false,
        isListening: false,
        isLive: false,
        isInitializing: false,
      };
      rerender(<AiSidebar />);
    });

    await waitFor(() => expect(mockDisconnectRealtime).toHaveBeenCalledTimes(1));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('routes voice transcripts through realtime when session is live', async () => {
    render(<AiSidebar />);
    const toggleButton = await screen.findByRole('button', { name: /Realtime Voice/i });

    await act(async () => {
      fireEvent.click(toggleButton);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    act(() => {
      triggerFinalTranscript?.('summarize my pipeline');
    });

    await waitFor(() => expect(mockRealtimeSend).toHaveBeenCalledWith('summarize my pipeline'));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('submits typed drafts via realtime when live', async () => {
    render(<AiSidebar />);
    const toggleButton = await screen.findByRole('button', { name: /Realtime Voice/i });

    await act(async () => {
      fireEvent.click(toggleButton);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    const textarea = await screen.findByPlaceholderText(/Ask AiSHA/i);
    fireEvent.change(textarea, { target: { value: 'Show me my quarterly pipeline.' } });

    await act(async () => {
      fireEvent.submit(textarea.closest('form'));
    });

    await waitFor(() => expect(mockRealtimeSend).toHaveBeenCalledWith('Show me my quarterly pipeline.'));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
