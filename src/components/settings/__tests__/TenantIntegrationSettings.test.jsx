import { describe, expect, it } from 'vitest';

import {
  applyIntegrationTypeDefaults,
  createCommunicationsProviderTemplate,
  normalizeIntegrationRecord,
  upsertIntegrationRecord,
} from '../TenantIntegrationSettings.jsx';

describe('TenantIntegrationSettings communications provider helpers', () => {
  it('builds a Zoho communications provider template', () => {
    const result = createCommunicationsProviderTemplate('aisha@aishacrm.com');

    expect(result.provider_type).toBe('imap_smtp');
    expect(result.provider_name).toBe('zoho_mail');
    expect(result.mailbox_address).toBe('aisha@aishacrm.com');
    expect(result.inbound.host).toBe('imap.zoho.com');
    expect(result.outbound.host).toBe('smtp.zoho.com');
    expect(result.features.inbound_enabled).toBe(true);
  });

  it('applies communications provider defaults without dropping existing mailbox values', () => {
    const result = applyIntegrationTypeDefaults(
      {
        integration_type: 'other',
        integration_name: '',
        is_active: true,
        config: {
          mailbox_address: 'aisha@aishacrm.com',
          mailbox_id: 'owner-primary',
        },
        api_credentials: {},
      },
      'communications_provider',
    );

    expect(result.integration_type).toBe('communications_provider');
    expect(result.integration_name).toBe('Zoho Mail');
    expect(result.config.mailbox_address).toBe('aisha@aishacrm.com');
    expect(result.config.mailbox_id).toBe('owner-primary');
    expect(result.config.inbound.host).toBe('imap.zoho.com');
    expect(result.config.outbound.from_address).toBe('aisha@aishacrm.com');
  });

  it('applies Cal.com defaults with auto-provision enabled', () => {
    const result = applyIntegrationTypeDefaults(
      {
        integration_type: 'other',
        integration_name: '',
        is_active: true,
        config: {},
        api_credentials: {},
      },
      'calcom',
    );

    expect(result.integration_type).toBe('calcom');
    expect(result.integration_name).toBe('Cal.com Booking');
    expect(result.config.auto_provision).toBe(true);
  });

  it('preserves explicit Cal.com auto-provision false', () => {
    const result = applyIntegrationTypeDefaults(
      {
        integration_type: 'other',
        integration_name: 'Custom',
        is_active: true,
        config: { auto_provision: false },
        api_credentials: {},
      },
      'calcom',
    );

    expect(result.integration_type).toBe('calcom');
    expect(result.integration_name).toBe('Custom');
    expect(result.config.auto_provision).toBe(false);
  });

  it('upserts saved integrations into the visible list immediately', () => {
    const previous = [
      {
        id: 'twilio-1',
        integration_type: 'twilio',
        integration_name: 'SMS',
        config: { enabled: true },
      },
    ];

    const saved = normalizeIntegrationRecord({
      id: 'calcom-1',
      integration_type: 'calcom',
      integration_name: 'Cal.com Booking',
      config: {
        cal_link: 'alice/team-meeting',
        calcom_user_id: 42,
      },
    });

    const result = upsertIntegrationRecord(previous, saved);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('calcom-1');
    expect(result[0].config.cal_link).toBe('alice/team-meeting');
    expect(result[0].configuration.calcom_user_id).toBe(42);
    expect(previous[0].id).toBe('twilio-1');
  });
});
