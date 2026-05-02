import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Env mock — flipped per-test via setEnv()
const envStore = {};
vi.mock('@/utils/runtimeEnv', () => ({
  getRuntimeEnv: (k) => envStore[k],
  shouldDisableSecureMode: () => false,
}));

// Minimal shadcn UI mocks so we don't have to mount the real Dialog tree.
vi.mock('../../ui/button', () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));
vi.mock('../../ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogTrigger: ({ children }) => <>{children}</>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
}));
vi.mock('../../ui/alert', () => ({
  Alert: ({ children }) => <div role="alert">{children}</div>,
  AlertDescription: ({ children }) => <div>{children}</div>,
}));

import { SessionReplayControl } from '../SessionReplayControl';

const setEnv = (overrides) => {
  Object.keys(envStore).forEach((k) => delete envStore[k]);
  Object.assign(envStore, overrides);
};

const targetUser = {
  id: '843b0151-f54d-45bc-abab-77105db51757',
  email: 'goddominusassets@gmail.com',
  name: 'Test User',
  tenant_id: '7272fbaa-90bd-4482-8c12-16a1d05a0ce3',
};

describe('SessionReplayControl', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'open', { value: vi.fn(), writable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      writable: true,
    });
  });

  it('renders nothing when provider is none', () => {
    setEnv({ VITE_SESSION_REPLAY_PROVIDER: 'none' });
    const { container } = render(<SessionReplayControl targetUser={targetUser} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for clarity without project id', () => {
    setEnv({
      VITE_SESSION_REPLAY_PROVIDER: 'clarity',
      VITE_CLARITY_PROJECT_ID: '',
    });
    const { container } = render(<SessionReplayControl targetUser={targetUser} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Clarity-flavored UI with project id', () => {
    setEnv({
      VITE_SESSION_REPLAY_PROVIDER: 'clarity',
      VITE_CLARITY_PROJECT_ID: 'wiijx4ahj6',
      VITE_CLARITY_DASHBOARD_URL: 'https://clarity.microsoft.com',
    });
    render(<SessionReplayControl targetUser={targetUser} />);
    expect(screen.getByText(/Microsoft Clarity/i)).toBeTruthy();
    expect(screen.getByText(/Live Take-Over/i)).toBeTruthy();
    // Dashboard URL must include project id and email filter
    const code = screen.getAllByText((c) => c.includes('wiijx4ahj6'))[0];
    expect(code.textContent).toContain('wiijx4ahj6');
    expect(code.textContent).toContain('goddominusassets%40gmail.com');
  });

  it('renders OpenReplay-flavored UI when provider=openreplay', () => {
    setEnv({
      VITE_SESSION_REPLAY_PROVIDER: 'openreplay',
      VITE_OPENREPLAY_PROJECT_KEY: 'asuEKaYlwEwTucD8njna',
      VITE_OPENREPLAY_DASHBOARD_URL: 'https://replay.example.com',
    });
    render(<SessionReplayControl targetUser={targetUser} />);
    expect(screen.getByText(/OpenReplay/i)).toBeTruthy();
    // OpenReplay supports native Assist — the take-over block should NOT render
    expect(screen.queryByText(/Live Take-Over/i)).toBeNull();
  });

  it('Start Live Take-Over opens a Jitsi room and is user-correlated', () => {
    setEnv({
      VITE_SESSION_REPLAY_PROVIDER: 'clarity',
      VITE_CLARITY_PROJECT_ID: 'wiijx4ahj6',
      VITE_HELP_MEETING_PROVIDER: 'jitsi',
    });
    render(<SessionReplayControl targetUser={targetUser} />);

    const btn = screen.getByText(/Start Live Take-Over/i).closest('button');
    fireEvent.click(btn);

    expect(window.open).toHaveBeenCalledTimes(1);
    const [url] = window.open.mock.calls[0];
    expect(url).toContain('https://meet.jit.si/');
    expect(url).toContain('aishacrm-assist-');
    // First 8 chars of tenant + uid land in the slug
    expect(url).toContain('7272fbaa');
    expect(url).toContain('843b0151');
  });

  it('back-compat: VITE_CLARITY_ENABLED=true selects clarity even without explicit provider', () => {
    setEnv({
      VITE_CLARITY_ENABLED: 'true',
      VITE_CLARITY_PROJECT_ID: 'wiijx4ahj6',
    });
    render(<SessionReplayControl targetUser={targetUser} />);
    expect(screen.getByText(/Microsoft Clarity/i)).toBeTruthy();
  });
});
