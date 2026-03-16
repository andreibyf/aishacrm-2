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
      linked_activities: [
        {
          id: 'act-1',
          type: 'email',
          subject: 'Follow-up email',
          status: 'sent',
        },
      ],
      latest_message: {
        id: 'msg-002',
        thread_id: 'thread-001',
        subject: 'Re: Intro call',
        text_body: 'Looking forward to next week.',
        activity: {
          id: 'act-1',
          type: 'email',
          subject: 'Follow-up email',
          status: 'sent',
        },
      },
      state: {
        events: [
          {
            type: 'thread_replay_requested',
            occurred_at: '2026-03-14T12:05:00.000Z',
            actor: 'owner@example.com',
            replay_job_id: 'replay-001',
          },
        ],
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
    delivery_state: null,
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
    linked_activities: [
      {
        id: 'act-1',
        type: 'email',
        subject: 'Follow-up email',
        status: 'sent',
      },
    ],
    state: {
      events: [
        {
          type: 'delivery_reconciled',
          occurred_at: '2026-03-14T12:06:00.000Z',
          actor: 'communications-worker',
          delivery_state: 'delivered',
        },
      ],
    },
  },
  messages: [
    {
      id: 'msg-001',
      thread_id: 'thread-001',
      internet_message_id: '<msg-001@example.com>',
      direction: 'inbound',
      sender_name: 'Prospect Name',
      sender_email: 'prospect@example.com',
      received_at: '2026-03-14T11:00:00.000Z',
      text_body: 'Thanks for the intro call.\n\nOn an earlier thread:\n> Prior quoted line',
      linked_entities: [],
    },
    {
      id: 'msg-002',
      thread_id: 'thread-001',
      internet_message_id: '<msg-002@example.com>',
      direction: 'outbound',
      received_at: '2026-03-14T12:00:00.000Z',
      text_body: 'Looking forward to next week.',
      linked_entities: [{ entity_type: 'activity', entity_id: 'act-1' }],
      linked_activities: [
        {
          id: 'act-1',
          type: 'email',
          subject: 'Follow-up email',
          status: 'sent',
        },
      ],
    },
  ],
  limit: 100,
  offset: 0,
};

const mockLeadCaptureQueueResponse = {
  queue_items: [
    {
      id: 'queue-001',
      tenant_id: 'tenant-1',
      thread_id: 'thread-001',
      message_id: 'msg-001',
      sender_email: 'prospect@example.com',
      sender_name: 'Prospect Name',
      sender_domain: 'example.com',
      subject: 'Interested in your services',
      status: 'pending_review',
      reason: 'unknown_sender',
      created_at: '2026-03-15T14:00:00.000Z',
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
};

const mockLeadCaptureQueueItemResponse = {
  id: 'queue-001',
  tenant_id: 'tenant-1',
  thread_id: 'thread-001',
  message_id: 'msg-001',
  mailbox_id: 'owner-primary',
  mailbox_address: 'owner@example.com',
  sender_email: 'prospect@example.com',
  sender_name: 'Prospect Name',
  sender_domain: 'example.com',
  subject: 'Interested in your services',
  normalized_subject: 'interested in your services',
  status: 'pending_review',
  reason: 'unknown_sender',
  metadata: {
    proposed_company: 'Example Co',
  },
  thread: {
    id: 'thread-001',
    subject: 'Interested in your services',
  },
  message: {
    id: 'msg-001',
    subject: 'Interested in your services',
    text_body: 'I would love to learn more about your services.',
  },
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
const replayThreadMock = vi.fn();
const updateThreadStatusMock = vi.fn();
const purgeThreadMock = vi.fn();
const generateThreadedAiReplyDraftMock = vi.fn();
const listLeadCaptureQueueMock = vi.fn();
const getLeadCaptureQueueItemMock = vi.fn();
const updateLeadCaptureQueueItemStatusMock = vi.fn();
const promoteLeadCaptureQueueItemMock = vi.fn();
const createActivityMock = vi.fn();
vi.mock('@/api/communications', () => ({
  listCommunicationThreads: (...args) => listThreadsMock(...args),
  getCommunicationThreadMessages: (...args) => getThreadMessagesMock(...args),
  replayCommunicationThread: (...args) => replayThreadMock(...args),
  updateCommunicationThreadStatus: (...args) => updateThreadStatusMock(...args),
  purgeCommunicationThread: (...args) => purgeThreadMock(...args),
  generateThreadedAiReplyDraft: (...args) => generateThreadedAiReplyDraftMock(...args),
  listLeadCaptureQueue: (...args) => listLeadCaptureQueueMock(...args),
  getLeadCaptureQueueItem: (...args) => getLeadCaptureQueueItemMock(...args),
  updateLeadCaptureQueueItemStatus: (...args) => updateLeadCaptureQueueItemStatusMock(...args),
  promoteLeadCaptureQueueItem: (...args) => promoteLeadCaptureQueueItemMock(...args),
}));
vi.mock('@/api/entities', () => ({
  Activity: {
    create: (...args) => createActivityMock(...args),
  },
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
    replayThreadMock.mockReset();
    updateThreadStatusMock.mockReset();
    purgeThreadMock.mockReset();
    generateThreadedAiReplyDraftMock.mockReset();
    listLeadCaptureQueueMock.mockReset();
    getLeadCaptureQueueItemMock.mockReset();
    updateLeadCaptureQueueItemStatusMock.mockReset();
    promoteLeadCaptureQueueItemMock.mockReset();
    createActivityMock.mockReset();
    listThreadsMock.mockResolvedValue(mockThreadsResponse);
    getThreadMessagesMock.mockResolvedValue(mockThreadDetailResponse);
    replayThreadMock.mockResolvedValue({
      ok: true,
      status: 'accepted',
      result: {
        thread_id: 'thread-001',
        replay_job_id: 'replay-001',
        processing_status: 'replay_requested',
      },
    });
    updateThreadStatusMock.mockResolvedValue({
      thread: {
        ...mockThreadDetailResponse.thread,
        status: 'closed',
      },
    });
    purgeThreadMock.mockResolvedValue({
      thread_id: 'thread-001',
      tenant_id: 'tenant-1',
      purged_at: '2026-03-15T02:00:00.000Z',
      purged_by: 'test@example.com',
    });
    generateThreadedAiReplyDraftMock.mockResolvedValue({
      response: 'I drafted a threaded reply for prospect@example.com and sent it for approval.',
      recipient_email: 'prospect@example.com',
      subject: 'Re: Intro call',
      generation_result: {
        status: 'pending_approval',
        suggestion_id: 'suggestion-thread-001',
      },
      reply_headers: {
        in_reply_to: '<msg-002@example.com>',
        references: ['<msg-001@example.com>', '<msg-002@example.com>'],
      },
    });
    listLeadCaptureQueueMock.mockResolvedValue(mockLeadCaptureQueueResponse);
    getLeadCaptureQueueItemMock.mockResolvedValue(mockLeadCaptureQueueItemResponse);
    updateLeadCaptureQueueItemStatusMock.mockResolvedValue({
      queue_item: {
        ...mockLeadCaptureQueueItemResponse,
        status: 'duplicate',
      },
    });
    promoteLeadCaptureQueueItemMock.mockResolvedValue({
      queue_item: {
        ...mockLeadCaptureQueueItemResponse,
        status: 'promoted',
        metadata: {
          promotion: {
            entity_type: 'lead',
            entity_id: 'lead-99',
          },
        },
      },
      lead: {
        id: 'lead-99',
        first_name: 'Prospect',
        last_name: 'Name',
        email: 'prospect@example.com',
      },
      already_promoted: false,
    });
    createActivityMock.mockResolvedValue({
      id: 'activity-email-001',
      type: 'email',
      status: 'queued',
    });
  });

  it('renders the inbox and loads thread + message data', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Re: Intro call')).toBeInTheDocument());
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalled());

    expect(screen.getByText('Prospect Name')).toBeInTheDocument();
    // Text appears in both thread-list preview and message detail panel
    expect(screen.getAllByText('Looking forward to next week.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/On an earlier thread:/)).toBeInTheDocument();
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Delivery Reconciled')).toBeInTheDocument();
    expect(screen.getAllByText('Activity: Follow-up email (sent)').length).toBeGreaterThanOrEqual(
      1,
    );
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

  it('passes delivery state through the thread query', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('combobox', { name: /delivery state/i }));
    fireEvent.click(await screen.findByText('Delivered'));

    await waitFor(() =>
      expect(listThreadsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          deliveryState: 'delivered',
        }),
      ),
    );
  });

  it('requests a replay for the selected thread and refreshes', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /replay thread/i }));

    await waitFor(() =>
      expect(replayThreadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          threadId: 'thread-001',
          mailboxId: 'owner-primary',
        }),
      ),
    );

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(2));
  });

  it('updates the selected thread status and refreshes', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /mark read/i }));

    await waitFor(() =>
      expect(updateThreadStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          threadId: 'thread-001',
          status: 'open',
        }),
      ),
    );

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(2));
  });

  it('archives the selected thread and refreshes', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /archive thread/i }));

    await waitFor(() =>
      expect(updateThreadStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          threadId: 'thread-001',
          status: 'archived',
        }),
      ),
    );
  });

  it('purges the selected thread and refreshes', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /purge thread/i }));

    await waitFor(() =>
      expect(purgeThreadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          threadId: 'thread-001',
        }),
      ),
    );

    window.confirm = originalConfirm;
  });

  it('queues an outbound email activity from the composer', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /compose/i }));

    fireEvent.change(screen.getByLabelText(/^to$/i), {
      target: { value: 'prospect@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^subject$/i), {
      target: { value: 'Follow up from AiSHA' },
    });
    fireEvent.change(screen.getByLabelText(/^body$/i), {
      target: { value: 'Thanks for taking the time to connect today.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /queue email/i }));

    await waitFor(() =>
      expect(createActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          type: 'email',
          status: 'queued',
          subject: 'Follow up from AiSHA',
          body: 'Thanks for taking the time to connect today.',
          related_email: 'prospect@example.com',
          metadata: expect.objectContaining({
            email: expect.objectContaining({
              to: 'prospect@example.com',
              subject: 'Follow up from AiSHA',
            }),
            communications: expect.objectContaining({
              mailbox_id: 'owner-primary',
            }),
          }),
        }),
      ),
    );
  });

  it('prefills and queues a reply tied to the selected thread', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /^reply$/i }));

    expect(screen.getByLabelText(/^to$/i)).toHaveValue('prospect@example.com');
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Re: Intro call');
    const replyBody = screen.getByLabelText(/^body$/i).value;
    expect(replyBody).toContain('On ');
    expect(replyBody).toContain(', You wrote:');
    expect(replyBody).toContain('> Looking forward to next week.');

    fireEvent.change(screen.getByLabelText(/^body$/i), {
      target: { value: 'Thanks for the quick reply.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /queue reply/i }));

    await waitFor(() =>
      expect(createActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          type: 'email',
          status: 'queued',
          related_email: 'prospect@example.com',
          metadata: expect.objectContaining({
            email: expect.objectContaining({
              to: 'prospect@example.com',
              subject: 'Re: Intro call',
              in_reply_to: '<msg-002@example.com>',
              references: ['<msg-001@example.com>', '<msg-002@example.com>'],
            }),
            communications: expect.objectContaining({
              mailbox_id: 'owner-primary',
              thread_id: 'thread-001',
            }),
          }),
        }),
      ),
    );
  });

  it('generates a threaded AI reply draft from the selected thread', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    await waitFor(() => expect(listThreadsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getThreadMessagesMock).toHaveBeenCalledTimes(1));

    const promptField = screen.getByLabelText(/draft instructions/i);
    fireEvent.change(promptField, {
      target: { value: 'Reply with pricing details and propose a 20-minute follow-up call.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /generate ai reply draft/i }));

    await waitFor(() =>
      expect(generateThreadedAiReplyDraftMock).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        threadId: 'thread-001',
        prompt: 'Reply with pricing details and propose a 20-minute follow-up call.',
        subject: 'Re: Intro call',
        requireApproval: true,
      }),
    );
    const reviewLink = await screen.findByRole('link', {
      name: /Approval suggestion suggestion-thread-001/i,
    });
    expect(reviewLink).toHaveAttribute('href', '/aisuggestions?suggestion=suggestion-thread-001');
    expect(
      await screen.findByText(/Approval suggestion suggestion-thread-001/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/In-Reply-To preserved/i)).toBeInTheDocument();
    expect(screen.getByText('pending_approval')).toBeInTheDocument();
  });

  it('renders the lead capture queue and promotes a reviewed sender to a lead', async () => {
    const CommunicationsPage = (await import('../Communications.jsx')).default;
    render(<CommunicationsPage />);

    fireEvent.click(screen.getByRole('button', { name: /lead capture queue/i }));

    await waitFor(() => expect(listLeadCaptureQueueMock).toHaveBeenCalled());
    await waitFor(() => expect(getLeadCaptureQueueItemMock).toHaveBeenCalled());

    expect(screen.getByText('Queue Review')).toBeInTheDocument();
    expect(screen.getByText('I would love to learn more about your services.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^company$/i), {
      target: { value: 'Example Holdings' },
    });
    fireEvent.change(screen.getByLabelText(/^review note$/i), {
      target: { value: 'Qualified from inbound email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /promote to lead/i }));

    await waitFor(() =>
      expect(promoteLeadCaptureQueueItemMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          queueItemId: 'queue-001',
          lead: expect.objectContaining({
            company: 'Example Holdings',
            note: 'Qualified from inbound email',
            email: 'prospect@example.com',
          }),
        }),
      ),
    );
  });
});