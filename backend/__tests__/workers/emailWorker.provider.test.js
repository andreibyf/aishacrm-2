import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { processActivity, setEmailWorkerDependenciesForTests } from '../../workers/emailWorker.js';

describe('email worker provider adapter delivery', () => {
  after(() => {
    setEmailWorkerDependenciesForTests(null);
  });

  it('delivers queued email through the resolved communications provider adapter', async () => {
    const activityUpdates = [];
    const webhookEvents = [];
    const persistedOutbound = [];
    const attachedActivities = [];

    setEmailWorkerDependenciesForTests({
      async resolveProviderConnection() {
        return {
          integration: { id: 'integration-001' },
          connection: {
            config: {
              provider_type: 'imap_smtp',
              provider_name: 'zoho_mail',
              mailbox_id: 'owner-primary',
              outbound: { from_address: 'owner@example.com' },
            },
          },
          adapter: {
            async sendMessage(message) {
              assert.equal(message.from, 'owner@example.com');
              assert.deepEqual(message.to, ['prospect@example.com']);
              assert.equal(message.subject, 'Follow up');
              return {
                ok: true,
                message_id: '<sent-123@example.com>',
                accepted: ['prospect@example.com'],
                rejected: [],
                response: '250 queued',
              };
            },
          },
        };
      },
      async markActivity(activityId, status, metadata) {
        activityUpdates.push({ activityId, status, metadata });
      },
      async createNotification() {
        throw new Error('createNotification should not be called on successful send');
      },
      async postStatusWebhook(payload) {
        webhookEvents.push(payload);
      },
      async persistOutboundThreadAndMessage(payload) {
        persistedOutbound.push(payload);
        return {
          thread: { id: 'thread-001' },
          message: { id: 'message-001' },
          links: [{ type: 'lead', id: 'lead-001', source: 'activity_relation', confidence: 1 }],
        };
      },
      async attachActivityToCommunicationsRecords(payload) {
        attachedActivities.push(payload);
      },
    });

    await processActivity({
      id: 'activity-001',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      subject: 'Follow up',
      body: 'Checking in after our meeting.',
      metadata: {
        email: {
          to: 'prospect@example.com',
          from: 'owner@example.com',
          subject: 'Follow up',
        },
        communications: {
          mailbox_id: 'owner-primary',
        },
      },
    });

    assert.equal(activityUpdates.length, 1);
    assert.equal(activityUpdates[0].status, 'sent');
    assert.equal(activityUpdates[0].metadata.delivery.provider, 'imap_smtp');
    assert.equal(activityUpdates[0].metadata.delivery.provider_name, 'zoho_mail');
    assert.equal(persistedOutbound.length, 1);
    assert.equal(persistedOutbound[0].messageId, '<sent-123@example.com>');
    assert.equal(persistedOutbound[0].mailboxId, 'owner-primary');
    assert.deepEqual(persistedOutbound[0].toList, ['prospect@example.com']);
    assert.equal(persistedOutbound[0].activity.metadata.communications.mailbox_id, 'owner-primary');
    assert.equal(attachedActivities.length, 1);
    assert.equal(attachedActivities[0].threadId, 'thread-001');
    assert.equal(attachedActivities[0].messageId, 'message-001');
    assert.equal(webhookEvents.length, 1);
    assert.equal(webhookEvents[0].event, 'email.sent');
  });

  it('persists a reply onto the selected communications thread', async () => {
    const persistedOutbound = [];

    setEmailWorkerDependenciesForTests({
      async resolveProviderConnection() {
        return {
          integration: { id: 'integration-001' },
          connection: {
            config: {
              provider_type: 'imap_smtp',
              provider_name: 'zoho_mail',
              mailbox_id: 'owner-primary',
              outbound: { from_address: 'owner@example.com' },
            },
          },
          adapter: {
            async sendMessage(message) {
              assert.equal(message.in_reply_to, '<msg-002@example.com>');
              assert.deepEqual(message.references, [
                '<msg-001@example.com>',
                '<msg-002@example.com>',
              ]);
              assert.equal(message.headers?.references, undefined);
              assert.equal(message.headers?.['in-reply-to'], undefined);
              return {
                ok: true,
                message_id: '<sent-reply@example.com>',
                accepted: ['prospect@example.com'],
                rejected: [],
                response: '250 queued',
              };
            },
          },
        };
      },
      async markActivity() {},
      async createNotification() {},
      async postStatusWebhook() {},
      async persistOutboundThreadAndMessage(payload) {
        persistedOutbound.push(payload);
        return {
          thread: { id: 'thread-001' },
          message: { id: 'message-002' },
          links: [],
        };
      },
      async attachActivityToCommunicationsRecords() {},
    });

    await processActivity({
      id: 'activity-004',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      subject: 'Re: Intro call',
      body: 'Thanks for the quick reply.',
      metadata: {
        email: {
          to: 'prospect@example.com',
          from: 'owner@example.com',
          subject: 'Re: Intro call',
          in_reply_to: '<msg-002@example.com>',
          references: ['<msg-001@example.com>', '<msg-002@example.com>'],
        },
        communications: {
          mailbox_id: 'owner-primary',
          thread_id: 'thread-001',
        },
      },
    });

    assert.equal(persistedOutbound.length, 1);
    assert.equal(persistedOutbound[0].activity.metadata.communications.thread_id, 'thread-001');
    assert.equal(persistedOutbound[0].activity.metadata.email.in_reply_to, '<msg-002@example.com>');
  });

  it('fails queued email when no communications provider mailbox matches', async () => {
    const activityUpdates = [];
    const notifications = [];

    setEmailWorkerDependenciesForTests({
      async resolveProviderConnection() {
        return null;
      },
      async markActivity(activityId, status, metadata) {
        activityUpdates.push({ activityId, status, metadata });
      },
      async createNotification(payload) {
        notifications.push(payload);
      },
      async postStatusWebhook() {},
    });

    await processActivity({
      id: 'activity-002',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      subject: 'Follow up',
      body: 'Checking in after our meeting.',
      metadata: {
        email: {
          to: 'prospect@example.com',
          from: 'owner@example.com',
          subject: 'Follow up',
        },
        communications: {
          mailbox_id: 'missing-mailbox',
        },
      },
    });

    assert.equal(activityUpdates.length, 1);
    assert.equal(activityUpdates[0].status, 'failed');
    assert.equal(activityUpdates[0].metadata.delivery.provider, 'communications_provider');
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].title, /No communications provider configured/);
  });

  it('marks queued email failed when mailbox resolution throws before send', async () => {
    const activityUpdates = [];
    const notifications = [];

    setEmailWorkerDependenciesForTests({
      async resolveProviderConnection() {
        const error = new Error(
          'mailboxId or mailboxAddress is required to resolve communications mailbox connections',
        );
        error.code = 'communications_provider_mailbox_required';
        throw error;
      },
      async markActivity(activityId, status, metadata) {
        activityUpdates.push({ activityId, status, metadata });
      },
      async createNotification(payload) {
        notifications.push(payload);
      },
      async postStatusWebhook() {},
    });

    await processActivity({
      id: 'activity-throwing-resolution',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      subject: 'Follow up',
      body: 'Checking in after our meeting.',
      metadata: {
        email: {
          to: 'prospect@example.com',
          subject: 'Follow up',
        },
        communications: {},
      },
    });

    assert.equal(activityUpdates.length, 1);
    assert.equal(activityUpdates[0].status, 'queued');
    assert.match(
      activityUpdates[0].metadata.delivery.error,
      /mailboxId or mailboxAddress is required/i,
    );
    assert.equal(notifications.length, 0);
  });

  it('generates and sends an ICS invite for scheduled meeting activities', async () => {
    const activityUpdates = [];
    const webhookEvents = [];

    setEmailWorkerDependenciesForTests({
      async resolveProviderConnection() {
        return {
          integration: { id: 'integration-001' },
          connection: {
            config: {
              provider_type: 'imap_smtp',
              provider_name: 'zoho_mail',
              mailbox_id: 'owner-primary',
              outbound: { from_address: 'owner@example.com' },
            },
          },
          adapter: {
            async sendMessage(message) {
              assert.equal(message.from, 'owner@example.com');
              assert.deepEqual(message.to, ['prospect@example.com']);
              assert.equal(message.subject, 'Strategy Session');
              assert.equal(Array.isArray(message.attachments), true);
              assert.equal(message.attachments.length, 1);
              assert.equal(message.attachments[0].filename, 'invite.ics');
              assert.match(message.attachments[0].contentType, /text\/calendar/);
              assert.match(message.attachments[0].content, /BEGIN:VCALENDAR/);
              assert.match(message.attachments[0].content, /METHOD:REQUEST/);
              assert.match(message.attachments[0].content, /UID:invite-001/);
              assert.match(message.attachments[0].content, /SUMMARY:Strategy Session/);
              return {
                ok: true,
                message_id: '<meeting-123@example.com>',
                accepted: ['prospect@example.com'],
                rejected: [],
                response: '250 queued',
              };
            },
          },
        };
      },
      async markActivity(activityId, status, metadata) {
        activityUpdates.push({ activityId, status, metadata });
      },
      async createNotification() {
        throw new Error(
          'createNotification should not be called on successful meeting invite send',
        );
      },
      async postStatusWebhook(payload) {
        webhookEvents.push(payload);
      },
    });

    await processActivity({
      id: 'activity-003',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      type: 'meeting',
      status: 'scheduled',
      subject: 'Strategy Session',
      body: 'Discuss the proposal and next steps.',
      due_date: '2026-03-20',
      due_time: '15:30',
      duration_minutes: 45,
      location: 'Zoom',
      related_email: 'prospect@example.com',
      metadata: {
        email: {
          from: 'owner@example.com',
          subject: 'Strategy Session',
        },
        communications: {
          mailbox_id: 'owner-primary',
        },
        meeting: {
          send_invite: true,
          invite_id: 'invite-001',
          attendees: [{ email: 'prospect@example.com', name: 'Prospect Name' }],
        },
      },
    });

    assert.equal(activityUpdates.length, 1);
    assert.equal(activityUpdates[0].status, 'scheduled');
    assert.equal(activityUpdates[0].metadata.delivery.provider, 'imap_smtp');
    assert.equal(activityUpdates[0].metadata.meeting.invite_status, 'sent');
    assert.equal(activityUpdates[0].metadata.meeting.invite_id, 'invite-001');
    assert.equal(webhookEvents.length, 1);
    assert.equal(webhookEvents[0].event, 'meeting.invite.sent');
    assert.equal(webhookEvents[0].invite_uid, 'invite-001');
  });
});
