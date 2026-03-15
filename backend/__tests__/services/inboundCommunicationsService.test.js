import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  handleInboundCommunicationsEvent,
  setInboundCommunicationsDependenciesForTests,
  setInboundCommunicationsToolExecutorForTests,
} from '../../services/inboundCommunicationsService.js';

function buildRequest() {
  return {
    tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    mailbox_id: 'owner-primary',
    mailbox_address: 'owner@example.com',
    source_service: 'communications-worker',
    event_type: 'communications.inbound.received',
    occurred_at: '2026-03-14T13:00:00.000Z',
    payload: {
      message_id: '<abc123@mail.aishacrm.com>',
      subject: 'Re: Intro call',
      received_at: '2026-03-14T13:00:00.000Z',
      from: {
        email: 'prospect@example.com',
        name: 'Prospect Name',
      },
      to: [{ email: 'owner@example.com', name: 'Owner' }],
      cc: [],
      bcc: [],
      text_body: 'Thanks, next week works for me.',
      html_body: '<p>Thanks, next week works for me.</p>',
      headers: {
        in_reply_to: '<prior@mail.aishacrm.com>',
        references: ['<root@mail.aishacrm.com>', '<prior@mail.aishacrm.com>'],
      },
      entity_refs: [
        {
          type: 'lead',
          id: 'lead-001',
        },
      ],
    },
    meta: {
      trace_id: 'trace-001',
      attempt: 1,
    },
    user: {
      id: 'internal-user',
      email: 'internal-service@system',
      role: 'employee',
      name: 'Internal Service',
    },
  };
}

describe('inbound communications service', () => {
  beforeEach(() => {
    setInboundCommunicationsToolExecutorForTests(async () => ({
      tag: 'Ok',
      value: {
        id: 'activity-001',
        metadata: {
          communications: {
            link_status: 'linked',
          },
        },
      },
    }));
    setInboundCommunicationsDependenciesForTests({
      resolveCanonicalTenant: async (tenantId) => ({
        uuid: tenantId,
        slug: 'owner-tenant',
        source: 'canonical',
      }),
      persistInboundThreadAndMessage: async (_request, resolvedTenant) => ({
        thread: { id: 'thread-001', tenant_id: resolvedTenant.id },
        message: {
          id: 'message-001',
          tenant_id: resolvedTenant.id,
          metadata: {
            attachments: [
              {
                filename: 'proposal.pdf',
                content_type: 'application/pdf',
              },
            ],
          },
        },
      }),
      resolveInboundEntityLinks: async () => [
        {
          type: 'lead',
          id: 'lead-001',
          source: 'explicit',
        },
      ],
      attachActivityToCommunicationsRecords: async ({ activity }) => ({
        ...activity,
        metadata: {
          ...(activity.metadata || {}),
          communications: {
            ...(activity.metadata?.communications || {}),
            thread_id: 'thread-001',
            stored_message_id: 'message-001',
            link_status: 'linked',
          },
        },
      }),
    });
  });

  it('returns persisted thread/message ids and linked entities in the accepted response', async () => {
    const result = await handleInboundCommunicationsEvent(buildRequest());

    assert.equal(result.status, 'accepted');
    assert.equal(result.result.thread_id, 'thread-001');
    assert.equal(result.result.stored_message_id, 'message-001');
    assert.equal(result.result.provider_message_id, '<abc123@mail.aishacrm.com>');
    assert.equal(result.result.attachment_count, 1);
    assert.equal(Array.isArray(result.result.linked_entities), true);
    assert.equal(result.result.linked_entities[0].entity_type, 'lead');
  });
});
