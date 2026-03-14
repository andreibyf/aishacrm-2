import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockThreadsResponse = {
  threads: [
    {
      id: 'thread-001',
      tenant_id: 'tenant-1',
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      subject: 'Re: Intro call',
      status: 'unread',
      last_message_at: '2026-03-14T12:00:00.000Z',
      linked_entities: [{ entity_type: 'lead', entity_id: 'lead-1' }],
      latest_message: {
        id: 'msg-002',
        thread_id: 'thread-001',
        subject: 'Re: Intro call',
        text_body: 'Looking forward to next week.',
      },
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
  applied_filters: {
    mailbox_id: null,
    status: null,
    view: 'all',
    entity_type: null,
    entity_id: null,
  },
};

const mockThreadDetailResponse = {
  thread: {
    id: 'thread-001',
    tenant_id: 'tenant-1',
    mailbox_id: 'owner-primary',
    mailbox_address: 'owner@example.com',
    subject: 'Re: Intro call',
    status: 'unread',
    linked_entities: [{ entity_type: 'lead', entity_id: 'lead-1' }],
  },
  messages: [
    {
      id: 'msg-001',
      thread_id: 'thread-001',
      direction: 'inbound',
      sender_name: 'Prospect Name',
      sender_email: 'prospect@example.com',
      received_at: '2026-03-14T11:00:00.000Z',
      text_body: 'Thanks for the intro call.',
      linked_entities: [],
    },
    {
      id: 'msg-002',
      thread_id: 'thread-001',
      direction: 'outbound',
      received_at: '2026-03-14T12:00:00.000Z',
      text_body: 'Looking forward to next week.',
      linked_entities: [{ entity_type: 'activity', entity_id: 'act-1' }],
    },
  ],
  limit: 100,
  offset: 0,
};

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: 'tenant-1', setSelectedTenantId: vi.fn() }),
}));

vi.mock('@/components/shared/useUser.js', () => ({
  useUser: () => ({
    user: { id: 'user-1', tenant_id: 'tenant-1', role: 'admin', crm_access: true },
    loading: false,
  }),
}));

const listThreadsMock = vi.fn();
const getThreadMessagesMock = vi.fn();
vi.mock('@/api/communications', () => ({
  listCommunicationThreads: (...args) => listThreadsMock(...args),
  getCommunicationThreadMessages: (...args) => getThreadMessagesMock(...args),
}));

const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

describe('Communications page smoke test', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterAll(() => {
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  beforeEach(() => {
    listThreadsMock.mockReset();
    getThreadMessagesMock.mockReset();
    listThreadsMock.mockResolvedValue(mockThreadsResponse);
    getThreadMessagesMock.mockResolvedValue(mockThreadDetailResponse);
  });

  it('renders the inbox and loads thread + message data', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    expect(screen.getByText('Inbox')).toBeInTheDocument();

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Re: Intro call')).toBeInTheDocument());
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalled());

    expect(screen.getByText('Prospect Name')).toBeInTheDocument();
    // Text appears in both thread-list preview and message detail panel
    expect(screen.getAllByText('Looking forward to next week.').length).toBeGreaterThanOrEqual(1);
  });

  it('passes unread view through the thread query', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('combobox', { name: /view/i }));
    fireEvent.click(await screen.findByText('Unread'));

    await waitFor(() =>
      expect(listThreadsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          view: 'unread',
        }),
      ),
    );
  });
});
