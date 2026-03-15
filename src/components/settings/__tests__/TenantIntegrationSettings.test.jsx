import { describe, expect, it } from 'vitest';

import {
  applyIntegrationTypeDefaults,
  createCommunicationsProviderTemplate,
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
});
