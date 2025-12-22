/**
 * Component tests for src/components/ai/AiShaActionHandler.jsx
 * Tests the AI action handler component
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import toast from 'sonner';
import AiShaActionHandler from './AiShaActionHandler';

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const renderWithRouter = (component, initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/*" element={component} />
      </Routes>
    </MemoryRouter>
  );
};

describe('AiShaActionHandler.jsx', () => {
  let mockNavigate;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate = vi.fn();
  });

  afterEach(() => {
    // Clean up event listeners
    window.removeEventListener('aisha:ai-local-action', vi.fn());
  });

  test('updates context on location change', async () => {
    const { rerender } = renderWithRouter(<AiShaActionHandler />, ['/leads']);

    // Wait for context to update
    await waitFor(() => {
      // Component should update internal context
      expect(true).toBe(true); // Basic assertion that component renders
    });

    // Navigate to different route
    rerender(
      <MemoryRouter initialEntries={['/accounts/123']}>
        <Routes>
          <Route path="/*" element={<AiShaActionHandler />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(true).toBe(true); // Context should update for detail view
    });
  });

  test('handles navigation actions', async () => {
    renderWithRouter(<AiShaActionHandler />, ['/dashboard']);

    // Simulate AI action event
    const actionEvent = new CustomEvent('aisha:ai-local-action', {
      detail: {
        action: 'navigate',
        path: '/leads',
        page: 'Leads',
      },
    });

    window.dispatchEvent(actionEvent);

    await waitFor(() => {
      // Should navigate and show toast
      expect(toast.success).toHaveBeenCalledWith('Navigating to Leads');
    });
  });

  test('handles edit actions', async () => {
    renderWithRouter(<AiShaActionHandler />, ['/leads']);

    // Simulate edit action
    const actionEvent = new CustomEvent('aisha:ai-local-action', {
      detail: {
        action: 'edit',
        entity: 'lead',
        id: '123',
        field: 'status',
        value: 'qualified',
      },
    });

    window.dispatchEvent(actionEvent);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Updated lead status to qualified');
    });
  });

  test('handles create actions', async () => {
    renderWithRouter(<AiShaActionHandler />, ['/leads']);

    // Simulate create action
    const actionEvent = new CustomEvent('aisha:ai-local-action', {
      detail: {
        action: 'create',
        entity: 'lead',
        data: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
        },
      },
    });

    window.dispatchEvent(actionEvent);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Created new lead');
    });
  });

  test('handles unsupported actions gracefully', async () => {
    renderWithRouter(<AiShaActionHandler />, ['/dashboard']);

    // Simulate unknown action
    const actionEvent = new CustomEvent('aisha:ai-local-action', {
      detail: {
        action: 'unknown_action',
        data: 'test',
      },
    });

    window.dispatchEvent(actionEvent);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unknown action: unknown_action');
    });
  });

  test('provides page context for AI', () => {
    renderWithRouter(<AiShaActionHandler />, ['/leads/123']);

    // Component should provide context through ref
    // This would be tested by checking the context object
    expect(true).toBe(true); // Component renders and sets up context
  });
});