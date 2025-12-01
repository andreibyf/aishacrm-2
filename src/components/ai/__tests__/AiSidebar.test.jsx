import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiSidebar from '../AiSidebar';
import AiAssistantLauncher from '../AiAssistantLauncher.jsx';
import { AiSidebarProvider, useAiSidebarState } from '../useAiSidebarState.jsx';

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
  return (
    <AiSidebarProvider>
      <LauncherBridge />
      <AiSidebar />
    </AiSidebarProvider>
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
});
