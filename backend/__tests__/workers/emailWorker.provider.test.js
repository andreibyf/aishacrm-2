import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  processActivity,
  setEmailWorkerDependenciesForTests,
} from '../../workers/emailWorker.js';

describe('email worker provider adapter delivery', () => {
  after(() => {
    setEmailWorkerDependenciesForTests(null);
  });

  it('delivers queued email through the resolved communications provider adapter', async () => {
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
    assert.equal(webhookEvents.length, 1);
    assert.equal(webhookEvents[0].event, 'email.sent');
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
});
