import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveMailboxConnectionForInboundJob } from '../../workers/communicationsWorker.js';

function buildSupabaseStub(rows) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    then(resolve) {
      return Promise.resolve(resolve({ data: rows, error: null }));
    },
  };

  return {
    from(tableName) {
      assert.equal(tableName, 'tenant_integrations');
      return chain;
    },
  };
}

function buildRow() {
  return {
    id: 'integration-001',
    tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    integration_type: 'communications_provider',
    integration_name: 'Zoho Mail',
    is_active: true,
    api_credentials: {
      inbound_username: 'owner@example.com',
      inbound_password: 'secret-inbound',
      outbound_username: 'owner@example.com',
      outbound_password: 'secret-outbound',
    },
    config: {
      provider_type: 'imap_smtp',
      provider_name: 'zoho_mail',
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      inbound: {
        host: 'imap.zoho.com',
        port: 993,
        secure: true,
      },
      outbound: {
        host: 'smtp.zoho.com',
        port: 587,
        secure: false,
        from_address: 'owner@example.com',
      },
    },
  };
}

describe('communications worker mailbox resolution', () => {
  it('resolves mailbox connection from tenant_integrations for inbound jobs', async () => {
    const resolved = await resolveMailboxConnectionForInboundJob(
      {
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailbox_id: 'owner-primary',
      },
      { supabase: buildSupabaseStub([buildRow()]) },
    );

    assert.equal(resolved.integration.id, 'integration-001');
    assert.equal(resolved.connection.config.provider_name, 'zoho_mail');
  });

  it('throws when no active mailbox connection matches', async () => {
    await assert.rejects(
      () =>
        resolveMailboxConnectionForInboundJob(
          {
            tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
            mailbox_id: 'missing-mailbox',
          },
          { supabase: buildSupabaseStub([buildRow()]) },
        ),
      (error) => error.code === 'communications_provider_not_found',
    );
  });
});
