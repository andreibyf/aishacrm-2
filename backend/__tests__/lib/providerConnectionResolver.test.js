import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCommunicationsProviderConnection } from '../../lib/communications/providerConnectionResolver.js';

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

function buildIntegrationRecord(overrides = {}) {
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
    ...overrides,
  };
}

describe('provider connection resolver', () => {
  it('resolves an active mailbox connection by mailbox_id', async () => {
    const supabase = buildSupabaseStub([buildIntegrationRecord()]);

    const resolved = await resolveCommunicationsProviderConnection(
      {
        tenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailboxId: 'owner-primary',
      },
      { supabase },
    );

    assert.equal(resolved.connection.config.provider_type, 'imap_smtp');
    assert.equal(resolved.connection.config.mailbox_id, 'owner-primary');
    assert.equal(typeof resolved.adapter.sendMessage, 'function');
  });

  it('resolves an active mailbox connection by mailbox_address', async () => {
    const supabase = buildSupabaseStub([buildIntegrationRecord()]);

    const resolved = await resolveCommunicationsProviderConnection(
      {
        tenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailboxAddress: 'OWNER@example.com',
      },
      { supabase },
    );

    assert.equal(resolved.connection.config.mailbox_address, 'owner@example.com');
  });

  it('returns null when no active mailbox matches', async () => {
    const supabase = buildSupabaseStub([buildIntegrationRecord()]);

    const resolved = await resolveCommunicationsProviderConnection(
      {
        tenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        mailboxId: 'other-mailbox',
      },
      { supabase },
    );

    assert.equal(resolved, null);
  });
});
