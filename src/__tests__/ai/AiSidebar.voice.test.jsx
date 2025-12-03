import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AiSidebar from '../../components/ai/AiSidebar.jsx';
const mockSendMessage = vi.fn();
const speechState = {
  transcript: '',
  isListening: false,
  isRecording: false,
  isTranscribing: false,
  error: null,
  startListening: vi.fn(),
  stopListening: vi.fn(),
  toggleListening: vi.fn(),
  // Legacy aliases for backward compatibility
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

vi.mock('../../components/ai/useAiSidebarState.jsx', () => ({
  useAiSidebarState: () => mockSidebarState
}));

vi.mock('../../components/ai/useSpeechInput.js', () => ({
  useSpeechInput: (options = {}) => {
    triggerFinalTranscript = options?.onFinalTranscript || null;
    return speechState;
  }
}));

vi.mock('../../components/ai/useSpeechOutput.js', () => ({
  useSpeechOutput: () => ({
    playText: mockPlayText,
    stopPlayback: mockStopPlayback,
    isLoading: false,
    isPlaying: false,
    error: null
  })
}));

// Mock the new voice interaction hooks
vi.mock('@/hooks/useVoiceInteraction.js', () => ({
  useVoiceInteraction: () => ({
    mode: 'idle',
    isListening: false,
    isTranscribing: false,
    isSpeaking: false,
    lastTranscript: '',
    error: null,
    isVoiceModeActive: false,
    isRealtimeConnected: false,
    playSpeech: vi.fn(),
    stopSpeech: vi.fn(),
    autoSpeakResponses: true,
    setMode: vi.fn(),
    startContinuous: vi.fn(),
    stopContinuous: vi.fn(),
    startPushToTalk: vi.fn(),
    stopPushToTalk: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    sendTextMessage: vi.fn(),
    reset: vi.fn(),
  })
}));

vi.mock('@/hooks/usePushToTalkKeybinding.js', () => ({
  usePushToTalkKeybinding: vi.fn()
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

  // Note: Listen button on individual message bubbles was removed - TTS is now handled globally

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

    await waitFor(() => expect(screen.getByText(/destructive command/i)).toBeInTheDocument());
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

  it('starts realtime voice when voice mode button is clicked', async () => {
    render(<AiSidebar />);
    const voiceButton = await screen.findByTestId('voice-mode-toggle');

    // Click to start - now uses Realtime API when available
    await act(async () => {
      fireEvent.click(voiceButton);
    });
    
    // Should connect to realtime, not legacy STT
    await waitFor(() => {
      expect(mockConnectRealtime).toHaveBeenCalled();
    });
  });

  it('emits telemetry events when realtime toggle is used', async () => {
    render(<AiSidebar />);

    // Now uses voice-mode-toggle button instead of Realtime Voice button
    const toggleButton = await screen.findByTestId('voice-mode-toggle');

    await act(async () => {
      fireEvent.click(toggleButton);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockConnectRealtime).toHaveBeenCalled();
    });

    expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ui.voice_mode.enabled',
    }));

    // Click the explicit "Disable Realtime Voice" button (has confirmation dialog)
    const disableButton = await screen.findByRole('button', { name: /Disable Realtime Voice/i });
    await act(async () => {
      fireEvent.click(disableButton);
    });

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    await waitFor(() => {
      expect(mockDisconnectRealtime).toHaveBeenCalled();
    });
    expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ui.realtime.toggle',
      payload: expect.objectContaining({ enabled: false, phase: 'success' })
    }));
  });

  it('logs telemetry when destructive voice commands are blocked', async () => {
    render(<AiSidebar />);

    act(() => {
      triggerFinalTranscript?.('delete all accounts now');
    });

    await waitFor(() => expect(screen.getByText(/destructive command/i)).toBeInTheDocument());
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
    const voiceToggle = await screen.findByTestId('voice-mode-toggle');

    await act(async () => {
      fireEvent.click(voiceToggle);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    // Click the explicit "Disable Realtime Voice" button (triggers confirmation)
    const disableButton = await screen.findByRole('button', { name: /Disable Realtime Voice/i });
    await act(async () => {
      fireEvent.click(disableButton);
    });

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    await waitFor(() => expect(mockDisconnectRealtime).toHaveBeenCalled());
  });

  it('keeps realtime session active when disable confirmation is cancelled', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    render(<AiSidebar />);
    const voiceToggle = await screen.findByTestId('voice-mode-toggle');

    await act(async () => {
      fireEvent.click(voiceToggle);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    // Click the explicit "Disable Realtime Voice" button (triggers confirmation, but will be cancelled)
    const disableButton = await screen.findByRole('button', { name: /Disable Realtime Voice/i });
    await act(async () => {
      fireEvent.click(disableButton);
    });

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockDisconnectRealtime).not.toHaveBeenCalled();
  });

  it('auto-disables realtime mode when the connection drops unexpectedly', async () => {
    const { rerender } = render(<AiSidebar />);
    const voiceToggle = await screen.findByTestId('voice-mode-toggle');

    await act(async () => {
      fireEvent.click(voiceToggle);
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
    const voiceToggle = await screen.findByTestId('voice-mode-toggle');

    await act(async () => {
      fireEvent.click(voiceToggle);
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
    const voiceToggle = await screen.findByTestId('voice-mode-toggle');

    await act(async () => {
      fireEvent.click(voiceToggle);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    const textarea = await screen.findByPlaceholderText(/Type a message/i);
    fireEvent.change(textarea, { target: { value: 'Show me my quarterly pipeline.' } });

    await act(async () => {
      fireEvent.submit(textarea.closest('form'));
    });

    await waitFor(() => expect(mockRealtimeSend).toHaveBeenCalledWith('Show me my quarterly pipeline.'));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PH2-VOICE-001: Voice Mode Toggle Tests
  // ─────────────────────────────────────────────────────────────────────────
  it('renders the Voice Mode toggle button', async () => {
    render(<AiSidebar />);
    const voiceModeToggle = await screen.findByTestId('voice-mode-toggle');
    expect(voiceModeToggle).toBeInTheDocument();
    expect(voiceModeToggle).toHaveTextContent(/Push to Talk/i);
  });

  it('toggles voice mode on click', async () => {
    render(<AiSidebar />);
    const voiceModeToggle = await screen.findByTestId('voice-mode-toggle');

    // Click to enable voice mode
    await act(async () => {
      fireEvent.click(voiceModeToggle);
    });

    // Should connect to realtime
    await waitFor(() => {
      expect(mockConnectRealtime).toHaveBeenCalled();
    });

    // Check telemetry was logged
    expect(mockTrackRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ui.voice_mode.enabled',
    }));
  });

  it('shows PTT button after realtime session starts', async () => {
    render(<AiSidebar />);
    const voiceModeToggle = await screen.findByTestId('voice-mode-toggle');

    // Enable realtime first
    await act(async () => {
      fireEvent.click(voiceModeToggle);
    });
    await waitFor(() => expect(mockConnectRealtime).toHaveBeenCalled());

    // PTT button should now be visible
    const pttButton = await screen.findByTestId('ptt-button');
    expect(pttButton).toBeInTheDocument();
    expect(pttButton).toHaveTextContent(/Hold to Talk/i);
  });
});
