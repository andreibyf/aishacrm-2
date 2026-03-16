import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => ({ selectedTenantId: 'tenant-123' }),
}));

vi.mock('@/components/shared/useUser', () => ({
  useUser: () => ({ user: { id: 'user-1', tenant_id: 'tenant-123' } }),
}));

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:3001',
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/functions', () => ({
  processChatEmailDraft: vi.fn(),
}));

import AishaEntityChatModal from '../AishaEntityChatModal.jsx';
import { processChatEmailDraft } from '@/api/functions';
import { toast } from 'sonner';

describe('AishaEntityChatModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('routes email drafting through processChatEmailDraft with modal entity context', async () => {
    processChatEmailDraft.mockResolvedValue({
      status: 200,
      data: {
        status: 'success',
        response: 'I drafted an email for willie@example.com and sent it for approval.',
        data: {
          recipient_email: 'willie@example.com',
          subject: 'Follow up from AiSHA',
          generation_result: {
            status: 'pending_approval',
          },
        },
      },
    });

    render(
      <AishaEntityChatModal
        open
        onClose={vi.fn()}
        entityType="lead"
        entityId="lead-123"
        relatedData={{}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draft a follow-up email' }));
    fireEvent.click(screen.getByRole('button', { name: /start task/i }));

    await waitFor(() => {
      expect(processChatEmailDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          entity_type: 'lead',
          entity_id: 'lead-123',
          prompt: 'Draft a follow-up email',
          require_approval: true,
        }),
      );
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await screen.findByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByText('willie@example.com')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('AI email draft sent for approval');
  });
});
