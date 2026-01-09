import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiSidebar from '../../components/ai/AiSidebar';
import AiAssistantLauncher from '../../components/ai/AiAssistantLauncher.jsx';
import { AiSidebarProvider, useAiSidebarState } from '../../components/ai/useAiSidebarState.jsx';
import UserContextInternal from '@/components/shared/UserContext.jsx';

function LauncherBridge() {
  const { isOpen, toggleSidebar, realtimeMode } = useAiSidebarState();
  return (
    <AiAssistantLauncher
      isOpen={isOpen}
      onToggle={toggleSidebar}
      isRealtimeActive={Boolean(realtimeMode)}
      realtimeModuleEnabled
    />
  );
}

function TestHarness() {
  const userContextValue = {
    user: { tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69', email: 'tester@example.com' },
    loading: false,
    reloadUser: () => { },
    refetch: () => { }
  };

  return (
    <UserContextInternal.Provider value={userContextValue}>
      <AiSidebarProvider>
        <LauncherBridge />
        <AiSidebar />
      </AiSidebarProvider>
    </UserContextInternal.Provider>
  );
}

describe('AiSidebar + AvatarWidget integration', () => {
  it('opens and closes the sidebar when toggled', () => {
    render(<TestHarness />);

    const sidebarRoot = screen.getByTestId('ai-sidebar-root');
    expect(sidebarRoot).toHaveAttribute('aria-hidden', 'true');

    const launcherButton = screen.getByLabelText(/Toggle AiSHA assistant/i);
    fireEvent.click(launcherButton);

    expect(sidebarRoot).toHaveAttribute('aria-hidden', 'false');

    const closeButton = screen.getByLabelText(/Close assistant/i);
    // The close button uses onMouseDown instead of onClick to prevent event bubbling issues
    fireEvent.mouseDown(closeButton);

    expect(sidebarRoot).toHaveAttribute('aria-hidden', 'true');
  });

  it('prefills draft input when a suggestion chip is clicked', async () => {
    render(<TestHarness />);

    const launcherButton = screen.getByLabelText(/Toggle AiSHA assistant/i);
    fireEvent.click(launcherButton);

    const suggestionChip = await screen.findByRole('button', { name: /Dashboard overview/i });
    fireEvent.click(suggestionChip);

    const textarea = await screen.findByPlaceholderText(/Type a message/i);
    await waitFor(() => {
      expect(textarea).toHaveValue('Give me a dashboard summary');
    });
  });

  it('renders conversational form when a guided chip is clicked', async () => {
    render(<TestHarness />);

    const launcherButton = screen.getByLabelText(/Toggle AiSHA assistant/i);
    fireEvent.click(launcherButton);

    // Button now uses icon with title attribute instead of visible text
    const guidedChip = await screen.findByTitle('New Lead');
    fireEvent.click(guidedChip);

    expect(await screen.findByText(/What's the lead's name/i)).toBeInTheDocument();
  });
});
