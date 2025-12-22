/**
 * Component tests for src/components/ai/AIAssistantWidget.jsx
 * Tests the AI assistant widget component
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import toast from 'sonner';
import AIAssistantWidget from './AIAssistantWidget';

// Mock dependencies
vi.mock('@/api/functions', () => ({
  generateDailyBriefing: vi.fn(),
  generateElevenLabsSpeech: vi.fn(),
  processChatCommand: vi.fn(),
  processDeveloperCommand: vi.fn(),
}));

vi.mock('@/utils/devLogger', () => ({
  logDev: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUser = {
  full_name: 'Test User',
  role: 'user',
};

describe('AIAssistantWidget.jsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders collapsed widget initially', () => {
    render(<AIAssistantWidget user={mockUser} />);

    // Should show the toggle button
    expect(screen.getByRole('button', { name: /open ai assistant/i })).toBeInTheDocument();

    // Should not show the chat interface
    expect(screen.queryByPlaceholderText(/ask me anything/i)).not.toBeInTheDocument();
  });

  test('opens and closes the widget', () => {
    render(<AIAssistantWidget user={mockUser} />);

    const toggleButton = screen.getByRole('button', { name: /open ai assistant/i });

    // Open the widget
    fireEvent.click(toggleButton);
    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeInTheDocument();

    // Close the widget
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    expect(screen.queryByPlaceholderText(/ask me anything/i)).not.toBeInTheDocument();
  });

  test('sends text message successfully', async () => {
    const { processChatCommand } = await import('@/api/functions');
    vi.mocked(processChatCommand).mockResolvedValue({
      status: 200,
      data: {
        assistantMessage: {
          content: 'Hello! How can I help you?',
          actions: [],
        },
        route: 'ai_chat',
      },
    });

    render(<AIAssistantWidget user={mockUser} />);

    // Open widget
    const toggleButton = screen.getByRole('button', { name: /open ai assistant/i });
    fireEvent.click(toggleButton);

    // Type and send message
    const input = screen.getByPlaceholderText(/ask me anything/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Hello AI' } });
    fireEvent.click(sendButton);

    // Check loading state
    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    // Wait for response
    await waitFor(() => {
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    });

    // Verify API call
    expect(processChatCommand).toHaveBeenCalledWith({
      text: 'Hello AI',
      history: expect.any(Array),
      context: expect.any(Object),
    });
  });

  test('handles API errors', async () => {
    const { processChatCommand } = await import('@/api/functions');
    vi.mocked(processChatCommand).mockRejectedValue(new Error('API Error'));

    render(<AIAssistantWidget user={mockUser} />);

    // Open widget
    const toggleButton = screen.getByRole('button', { name: /open ai assistant/i });
    fireEvent.click(toggleButton);

    // Send message
    const input = screen.getByPlaceholderText(/ask me anything/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to send message. Please try again.');
    });
  });

  test('shows developer mode for superadmins', () => {
    const superUser = { ...mockUser, role: 'superadmin' };
    render(<AIAssistantWidget user={superUser} />);

    // Open widget
    const toggleButton = screen.getByRole('button', { name: /open ai assistant/i });
    fireEvent.click(toggleButton);

    // Should show developer mode toggle
    expect(screen.getByText(/Developer Mode/)).toBeInTheDocument();
  });

  test('handles voice input toggle', () => {
    render(<AIAssistantWidget user={mockUser} />);

    // Open widget
    const toggleButton = screen.getByRole('button', { name: /open ai assistant/i });
    fireEvent.click(toggleButton);

    // Should have voice toggle button
    const voiceButton = screen.getByRole('button', { name: /start voice input/i });
    expect(voiceButton).toBeInTheDocument();

    // Click to start voice (would normally request permission)
    fireEvent.click(voiceButton);
    // In test environment, speech recognition is mocked
  });

  test('displays messages in chat', () => {
    render(<AIAssistantWidget user={mockUser} />);

    // Open widget
    const toggleButton = screen.getByRole('button', { name: /open ai assistant/i });
    fireEvent.click(toggleButton);

    // Should show initial messages or empty state
    expect(screen.getByText(/AI Assistant/)).toBeInTheDocument();
  });
});