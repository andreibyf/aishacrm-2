/**
 * Component tests for src/components/ai/AiSidebar.jsx
 * Tests the AI sidebar component
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'sonner';
import AiSidebar from './AiSidebar';
import { useAiSidebarState } from './useAiSidebarState.jsx';

// Mock all the hooks and dependencies
vi.mock('./useAiSidebarState.jsx', () => ({
  useAiSidebarState: vi.fn(() => ({
    isOpen: false,
    messages: [],
    isLoading: false,
    toggleSidebar: vi.fn(),
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
  })),
}));

vi.mock('./useSpeechInput.js', () => ({
  useSpeechInput: vi.fn(() => ({
    isListening: false,
    transcript: '',
    startListening: vi.fn(),
    stopListening: vi.fn(),
  })),
}));

vi.mock('./useSpeechOutput.js', () => ({
  useSpeechOutput: vi.fn(() => ({
    isSpeaking: false,
    speak: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock('@/hooks/useRealtimeAiSHA.js', () => ({
  useRealtimeAiSHA: vi.fn(() => ({
    isConnected: false,
    connectionStatus: 'disconnected',
  })),
}));

vi.mock('@/hooks/usePushToTalkKeybinding.js', () => ({
  usePushToTalkKeybinding: vi.fn(() => ({})),
}));

vi.mock('@/hooks/useWakeWordDetection.js', () => ({
  useWakeWordDetection: vi.fn(() => ({})),
}));

vi.mock('@/components/shared/ConfirmDialog.jsx', () => ({
  useConfirmDialog: vi.fn(() => ({
    confirm: vi.fn(),
  })),
}));

vi.mock('@/utils/realtimeTelemetry.js', () => ({
  trackRealtimeEvent: vi.fn(),
  subscribeToRealtimeTelemetry: vi.fn(),
  getRealtimeTelemetrySnapshot: vi.fn(),
}));

vi.mock('@/components/ai/conversationalForms', () => ({
  listConversationalSchemas: vi.fn(() => []),
  getSchemaById: vi.fn(),
}));

vi.mock('@/api/entities', () => ({
  Account: vi.fn(),
  Activity: vi.fn(),
  Contact: vi.fn(),
  Lead: vi.fn(),
  Opportunity: vi.fn(),
  BizDevSource: vi.fn(),
}));

vi.mock('@/components/shared/useUser.js', () => ({
  useUser: vi.fn(() => ({ user: { id: 'test-user' } })),
}));

vi.mock('@/lib/ambiguityResolver', () => ({
  isLikelyVoiceGarble: vi.fn(() => false),
  sanitizeMessageText: vi.fn((text) => text),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AiSidebar.jsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders collapsed sidebar initially', () => {
    render(<AiSidebar />);

    // Should show the toggle button
    expect(screen.getByRole('button', { name: /toggle ai sidebar/i })).toBeInTheDocument();

    // Should not show chat interface when closed
    expect(screen.queryByPlaceholderText(/ask aisha/i)).not.toBeInTheDocument();
  });

  test('opens sidebar when toggle is clicked', () => {
    // Mock open state
    useAiSidebarState.mockReturnValue({
      isOpen: true,
      messages: [],
      isLoading: false,
      toggleSidebar: vi.fn(),
      sendMessage: vi.fn(),
      clearMessages: vi.fn(),
    });

    render(<AiSidebar />);

    // Should show chat interface when open
    expect(screen.getByPlaceholderText(/ask aisha/i)).toBeInTheDocument();
  });

  test('displays quick actions', () => {
    useAiSidebarState.mockReturnValue({
      isOpen: true,
      messages: [],
      isLoading: false,
      toggleSidebar: vi.fn(),
      sendMessage: vi.fn(),
      clearMessages: vi.fn(),
    });

    render(<AiSidebar />);

    // Should show quick action buttons
    expect(screen.getByText('Show leads')).toBeInTheDocument();
    expect(screen.getByText('View pipeline')).toBeInTheDocument();
    expect(screen.getByText('My tasks')).toBeInTheDocument();
  });

  test('handles message sending', async () => {
    const mockSendMessage = vi.fn();
    useAiSidebarState.mockReturnValue({
      isOpen: true,
      messages: [],
      isLoading: false,
      toggleSidebar: vi.fn(),
      sendMessage: mockSendMessage,
      clearMessages: vi.fn(),
    });

    render(<AiSidebar />);

    const input = screen.getByPlaceholderText(/ask aisha/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Hello AI' } });
    fireEvent.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith('Hello AI');
  });

  test('shows loading state during message processing', () => {
    useAiSidebarState.mockReturnValue({
      isOpen: true,
      messages: [{ role: 'user', content: 'Test' }],
      isLoading: true,
      toggleSidebar: vi.fn(),
      sendMessage: vi.fn(),
      clearMessages: vi.fn(),
    });

    render(<AiSidebar />);

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  test('displays messages in chat', () => {
    useAiSidebarState.mockReturnValue({
      isOpen: true,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      isLoading: false,
      toggleSidebar: vi.fn(),
      sendMessage: vi.fn(),
      clearMessages: vi.fn(),
    });

    render(<AiSidebar />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  test('shows voice input controls', () => {
    useAiSidebarState.mockReturnValue({
      isOpen: true,
      messages: [],
      isLoading: false,
      toggleSidebar: vi.fn(),
      sendMessage: vi.fn(),
      clearMessages: vi.fn(),
    });

    render(<AiSidebar />);

    // Should have voice-related buttons
    expect(screen.getByRole('button', { name: /voice input/i })).toBeInTheDocument();
  });
});