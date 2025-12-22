/**
 * Component tests for src/components/ai/ChatInterface.jsx
 * Tests the AI chat interface component
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ChatInterface from './ChatInterface';

// Mock dependencies
vi.mock('@/api/functions', () => ({
  processChatCommand: vi.fn(),
  processDeveloperCommand: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

const mockUser = {
  full_name: 'Test User',
  role: 'user',
};

const renderWithRouter = (component) => {
  return render(
    <MemoryRouter>
      {component}
    </MemoryRouter>
  );
};

describe('ChatInterface.jsx', () => {
  let mockNavigate;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate = vi.fn();
    useNavigate.mockReturnValue(mockNavigate);
  });

  test('renders initial welcome message', () => {
    renderWithRouter(<ChatInterface user={mockUser} />);

    expect(screen.getByText(/Hello Test User!/)).toBeInTheDocument();
    expect(screen.getByText(/I'm your AI CRM assistant/)).toBeInTheDocument();
  });

  test('renders input field and send button', () => {
    renderWithRouter(<ChatInterface user={mockUser} />);

    const input = screen.getByPlaceholderText(/Ask me anything/);
    const sendButton = screen.getByRole('button', { name: /send/i });

    expect(input).toBeInTheDocument();
    expect(sendButton).toBeInTheDocument();
  });

  test('sends message and displays response', async () => {
    const { processChatCommand } = await import('@/api/functions');
    vi.mocked(processChatCommand).mockResolvedValue({
      status: 200,
      data: {
        assistantMessage: {
          content: 'Here is your response',
          actions: [],
        },
        route: 'ai_chat',
      },
    });

    renderWithRouter(<ChatInterface user={mockUser} />);

    const input = screen.getByPlaceholderText(/Ask me anything/);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Hello AI' } });
    fireEvent.click(sendButton);

    // Check loading state
    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    // Wait for response
    await waitFor(() => {
      expect(screen.getByText('Here is your response')).toBeInTheDocument();
    });

    // Verify API was called
    expect(processChatCommand).toHaveBeenCalledWith({
      text: 'Hello AI',
      history: expect.any(Array),
      context: expect.any(Object),
    });
  });

  test('handles API errors gracefully', async () => {
    const { processChatCommand } = await import('@/api/functions');
    vi.mocked(processChatCommand).mockRejectedValue(new Error('API Error'));

    renderWithRouter(<ChatInterface user={mockUser} />);

    const input = screen.getByPlaceholderText(/Ask me anything/);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to process message. Please try again.');
    });
  });

  test('shows developer mode toggle for appropriate users', () => {
    const devUser = { ...mockUser, role: 'superadmin' };
    renderWithRouter(<ChatInterface user={devUser} />);

    // Should show developer mode toggle
    expect(screen.getByText(/Developer Mode/)).toBeInTheDocument();
  });

  test('handles navigation from tool results', async () => {
    const { processChatCommand } = await import('@/api/functions');
    vi.mocked(processChatCommand).mockResolvedValue({
      status: 200,
      data: {
        assistantMessage: {
          content: 'Navigating to leads',
          actions: [],
        },
        route: 'ai_chat',
        toolInteractions: [{
          tool: 'navigate_to_page',
          result_preview: '{"action": "navigate", "path": "/leads", "page": "Leads"}',
        }],
      },
    });

    renderWithRouter(<ChatInterface user={mockUser} />);

    const input = screen.getByPlaceholderText(/Ask me anything/);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Go to leads' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/leads');
      expect(toast.success).toHaveBeenCalledWith('Navigating to Leads');
    });
  });
});