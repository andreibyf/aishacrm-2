import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiSidebar from '../AiSidebar';
import AiAssistantLauncher from '../AiAssistantLauncher.jsx';
import { AiSidebarProvider, useAiSidebarState } from '../useAiSidebarState.jsx';
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
    user: { tenant_id: 'tenant-123', email: 'tester@example.com' },
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
    fireEvent.click(closeButton);

    expect(sidebarRoot).toHaveAttribute('aria-hidden', 'true');
  });

  it('prefills draft input when a suggestion chip is clicked', async () => {
    render(<TestHarness />);

    const launcherButton = screen.getByLabelText(/Toggle AiSHA assistant/i);
    fireEvent.click(launcherButton);

    const suggestionChip = await screen.findByRole('button', { name: /Dashboard overview/i });
    fireEvent.click(suggestionChip);

    const textarea = await screen.findByPlaceholderText(/Ask AiSHA/i);
    await waitFor(() => {
      expect(textarea).toHaveValue('Give me a dashboard summary');
    });
  });

  it('renders conversational form when a guided chip is clicked', async () => {
    render(<TestHarness />);

    const launcherButton = screen.getByLabelText(/Toggle AiSHA assistant/i);
    fireEvent.click(launcherButton);

    const guidedChip = await screen.findByRole('button', { name: /New Lead/i });
    fireEvent.click(guidedChip);

    expect(await screen.findByText(/What's the lead's name/i)).toBeInTheDocument();
  });
});
