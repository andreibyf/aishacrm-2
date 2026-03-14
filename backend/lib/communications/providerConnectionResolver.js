import { getSupabaseClient } from '../supabase-db.js';
import {
  buildCommunicationsProviderConnection,
  isCommunicationsProviderIntegration,
} from '../communicationsConfig.js';

function normalizeIntegrationRecord(record = {}) {
  return {
    ...record,
    config: record.config || record.configuration || {},
    api_credentials: record.api_credentials || record.credentials || {},
  };
}

function mailboxMatches(record, mailboxId, mailboxAddress) {
  const config = record.config || {};
  const normalizedMailboxId = mailboxId ? String(mailboxId).trim() : null;
  const normalizedMailboxAddress = mailboxAddress ? String(mailboxAddress).trim().toLowerCase() : null;
  const recordMailboxId = config.mailbox_id ? String(config.mailbox_id).trim() : null;
  const recordMailboxAddress = config.mailbox_address
    ? String(config.mailbox_address).trim().toLowerCase()
    : null;

  if (normalizedMailboxId && recordMailboxId === normalizedMailboxId) {
    return true;
  }

  if (normalizedMailboxAddress && recordMailboxAddress === normalizedMailboxAddress) {
    return true;
  }

  return false;
}

export async function resolveCommunicationsProviderConnection(
  { tenantId, mailboxId, mailboxAddress },
  { supabase = getSupabaseClient() } = {},
) {
  if (!tenantId) {
    const error = new Error('tenantId is required to resolve communications mailbox connections');
    error.code = 'communications_provider_tenant_required';
    throw error;
  }

  if (!mailboxId && !mailboxAddress) {
    const error = new Error('mailboxId or mailboxAddress is required to resolve communications mailbox connections');
    error.code = 'communications_provider_mailbox_required';
    throw error;
  }

  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type, integration_name, api_credentials, config, configuration, is_active, metadata')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'communications_provider')
    .eq('is_active', true);

  if (error) {
    const resolutionError = new Error(`Failed to resolve communications provider connection: ${error.message}`);
    resolutionError.code = 'communications_provider_lookup_failed';
    throw resolutionError;
  }

  const matchingRecord = (data || [])
    .map(normalizeIntegrationRecord)
    .find((record) => isCommunicationsProviderIntegration(record.integration_type) && mailboxMatches(record, mailboxId, mailboxAddress));

  if (!matchingRecord) {
    return null;
  }

  const resolved = buildCommunicationsProviderConnection(matchingRecord);
  return {
    integration: matchingRecord,
    ...resolved,
  };
}

export default {
  resolveCommunicationsProviderConnection,
};
