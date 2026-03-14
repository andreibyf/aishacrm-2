import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isCommunicationsProviderIntegration,
  validateCommunicationsProviderConfig,
  buildCommunicationsProviderConnection,
} from '../../lib/communicationsConfig.js';
import {
  COMMUNICATIONS_PROVIDER_TYPES,
  COMMUNICATIONS_PROVIDER_METHODS,
  normalizeCommunicationsProviderError,
} from '../../lib/communications/providerAdapter.js';

function buildValidConfig() {
  return {
    tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    config: {
      provider_type: COMMUNICATIONS_PROVIDER_TYPES.IMAP_SMTP,
      provider_name: 'zoho_mail',
      mailbox_id: 'owner-primary',
      mailbox_address: 'owner@example.com',
      inbound: {
        host: 'imap.zoho.com',
        port: 993,
        secure: true,
        auth_mode: 'password',
        folder: 'INBOX',
        poll_interval_ms: 30000,
      },
      outbound: {
        host: 'smtp.zoho.com',
        port: 587,
        secure: false,
        auth_mode: 'password',
        from_address: 'owner@example.com',
      },
      sync: {
        cursor_strategy: 'uid',
        raw_retention_days: 30,
        replay_enabled: true,
      },
      features: {
        inbound_enabled: true,
        outbound_enabled: true,
        lead_capture_enabled: true,
        meeting_scheduling_enabled: true,
      },
    },
    api_credentials: {
      inbound_username: 'owner@example.com',
      inbound_password: 'secret-inbound',
      outbound_username: 'owner@example.com',
      outbound_password: 'secret-outbound',
    },
  };
}

describe('communications provider config', () => {
  it('identifies communications_provider integrations', () => {
    assert.equal(isCommunicationsProviderIntegration('communications_provider'), true);
    assert.equal(isCommunicationsProviderIntegration('gmail_smtp'), false);
  });

  it('validates a provider-backed mailbox configuration', () => {
    const result = validateCommunicationsProviderConfig(buildValidConfig());

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.normalized.provider_type, COMMUNICATIONS_PROVIDER_TYPES.IMAP_SMTP);
    assert.equal(result.normalized.mailbox_id, 'owner-primary');
  });

  it('rejects missing endpoint credentials and mailbox fields', () => {
    const invalid = buildValidConfig();
    delete invalid.config.mailbox_id;
    invalid.api_credentials = {};

    const result = validateCommunicationsProviderConfig(invalid);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((entry) => entry.field === 'config.mailbox_id'));
    assert.ok(result.errors.some((entry) => entry.field === 'credentials.inbound'));
    assert.ok(result.errors.some((entry) => entry.field === 'credentials.outbound'));
  });

  it('builds a provider connection with a complete adapter contract', () => {
    const { connection, adapter } = buildCommunicationsProviderConnection(buildValidConfig());

    assert.equal(connection.config.provider_name, 'zoho_mail');
    for (const methodName of COMMUNICATIONS_PROVIDER_METHODS) {
      assert.equal(typeof adapter[methodName], 'function', `${methodName} should exist`);
    }
  });

  it('normalizes provider errors into a stable shape', () => {
    const normalized = normalizeCommunicationsProviderError(
      { message: 'upstream timeout', code: 'ETIMEDOUT', retryable: true },
      { provider_type: COMMUNICATIONS_PROVIDER_TYPES.IMAP_SMTP, provider_name: 'zoho_mail' },
    );

    assert.deepEqual(normalized, {
      provider_type: COMMUNICATIONS_PROVIDER_TYPES.IMAP_SMTP,
      provider_name: 'zoho_mail',
      operation: null,
      code: 'ETIMEDOUT',
      message: 'upstream timeout',
      retryable: true,
    });
  });
});
