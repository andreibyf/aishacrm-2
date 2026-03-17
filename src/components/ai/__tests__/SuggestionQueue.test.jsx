import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, ...props }) => <button {...props}>{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
  TooltipProvider: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }) => <div>{children}</div>,
  CollapsibleContent: ({ children }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:3001',
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

import SuggestionQueue from '../SuggestionQueue.jsx';

describe('SuggestionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          suggestions: [
            {
              id: 'suggestion-001',
              trigger_type: 'followup_needed',
              record_name: 'Focus Record',
              record_type: 'lead',
              record_id: 'lead-001',
              created_at: '2026-03-16T18:00:00.000Z',
              priority: 'high',
              confidence: 0.92,
              reasoning: 'Focused suggestion reasoning.',
              action: {
                tool_name: 'send_email',
                tool_args: {
                  to: 'andrei.byfield@gmail.com',
                  subject: 'Re: New Thread Test',
                  body_prompt: 'Draft a concise, professional reply to the latest message.',
                  source: 'care_playbook',
                  email: {
                    references: ['<abc@aishacrm.com>'],
                    in_reply_to: '<abc@aishacrm.com>',
                  },
                  communications: {
                    thread_id: '5262bbbf-45bc-4bb0-b111-40608aae79a8',
                    mailbox_id: 'owner-primary',
                    participants: [
                      { name: null, role: 'sender', email: 'andrei.byfield@aishacrm.com' },
                      { name: null, role: 'to', email: 'andrei.byfield@gmail.com' },
                    ],
                  },
                },
              },
            },
            {
              id: 'suggestion-002',
              trigger_type: 'activity_overdue',
              record_name: 'Other Record',
              record_type: 'lead',
              record_id: 'lead-002',
              created_at: '2026-03-16T17:00:00.000Z',
              priority: 'normal',
              confidence: 0.61,
              reasoning: 'Other suggestion reasoning.',
              action: { tool_name: 'create_task' },
            },
          ],
        },
      }),
    }));
  });

  it('filters the list down to the focused suggestion', async () => {
    render(<SuggestionQueue tenantId="tenant-1" focusSuggestionId="suggestion-001" />);

    await waitFor(() => expect(screen.getByText('Focus Record')).toBeInTheDocument());

    expect(screen.getByText(/Showing suggestion suggestion-001/i)).toBeInTheDocument();
    expect(screen.queryByText('Other Record')).not.toBeInTheDocument();
    expect(screen.getByText(/1 pending suggestion for review/i)).toBeInTheDocument();
  });

  it('offers a one-click way back to the full queue when focused', async () => {
    const onClearFocus = vi.fn();
    render(
      <SuggestionQueue
        tenantId="tenant-1"
        focusSuggestionId="suggestion-001"
        onClearFocus={onClearFocus}
      />,
    );

    await waitFor(() => expect(screen.getByText('Focus Record')).toBeInTheDocument());

    screen.getByRole('button', { name: /show all suggestions/i }).click();

    expect(onClearFocus).toHaveBeenCalledTimes(1);
  });

  it('renders email preview for send_email suggestions instead of raw JSON', async () => {
    render(<SuggestionQueue tenantId="tenant-1" focusSuggestionId="suggestion-001" />);

    await waitFor(() => expect(screen.getByText('Focus Record')).toBeInTheDocument());

    // Should show human-readable email fields
    expect(screen.getByText('Email Reply')).toBeInTheDocument();
    expect(screen.getByText('andrei.byfield@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Re: New Thread Test')).toBeInTheDocument();
    expect(screen.getByText('andrei.byfield@aishacrm.com')).toBeInTheDocument();

    // Should show the body prompt context
    expect(
      screen.getByText('Draft a concise, professional reply to the latest message.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/AI will draft this message using/)).toBeInTheDocument();

    // Should show source badge
    expect(screen.getByText('via care playbook')).toBeInTheDocument();

    // Should NOT show raw JSON keys like tool_args or thread_id in full
    expect(screen.queryByText(/"tool_name"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"tool_args"/)).not.toBeInTheDocument();
  });

  it('renders raw JSON for non-email tool suggestions', async () => {
    render(<SuggestionQueue tenantId="tenant-1" focusSuggestionId="suggestion-002" />);

    await waitFor(() => expect(screen.getByText('Other Record')).toBeInTheDocument());

    // Non-email suggestions should still show raw JSON
    expect(screen.getByText(/"tool_name": "create_task"/)).toBeInTheDocument();
  });
});