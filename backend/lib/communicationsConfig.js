import { isValidUUID } from './uuidValidator.js';
import {
  COMMUNICATIONS_PROVIDER_TYPES,
  createCommunicationsProviderAdapter,
  assertCommunicationsProviderAdapter,
} from './communications/providerAdapter.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function hasCredentialPair(credentials, prefix) {
  return isNonEmptyString(credentials?.[`${prefix}_username`]) &&
    isNonEmptyString(credentials?.[`${prefix}_password`]);
}

function hasSecretRefs(config, prefix) {
  return isNonEmptyString(config?.[`${prefix}_username_secret_ref`]) &&
    isNonEmptyString(config?.[`${prefix}_password_secret_ref`]);
}

export function isCommunicationsProviderIntegration(integrationType) {
  return integrationType === 'communications_provider';
}

export function validateCommunicationsProviderConfig(input = {}) {
  const errors = [];
  const tenantId = input.tenant_id;
  const config = isPlainObject(input.config) ? input.config : {};
  const apiCredentials = isPlainObject(input.api_credentials) ? input.api_credentials : {};
  const inbound = isPlainObject(config.inbound) ? config.inbound : {};
  const outbound = isPlainObject(config.outbound) ? config.outbound : {};
  const sync = isPlainObject(config.sync) ? config.sync : {};
  const features = isPlainObject(config.features) ? config.features : {};

  if (tenantId !== undefined && tenantId !== null && !isValidUUID(tenantId)) {
    errors.push({ field: 'tenant_id', message: 'tenant_id must be a valid UUID when provided' });
  }

  if (!isNonEmptyString(config.provider_type)) {
    errors.push({ field: 'config.provider_type', message: 'provider_type is required' });
  } else if (!Object.values(COMMUNICATIONS_PROVIDER_TYPES).includes(config.provider_type)) {
    errors.push({
      field: 'config.provider_type',
      message: `provider_type must be one of: ${Object.values(COMMUNICATIONS_PROVIDER_TYPES).join(', ')}`,
    });
  }

  if (!isNonEmptyString(config.provider_name)) {
    errors.push({ field: 'config.provider_name', message: 'provider_name is required' });
  }

  if (!isNonEmptyString(config.mailbox_id)) {
    errors.push({ field: 'config.mailbox_id', message: 'mailbox_id is required' });
  }

  if (!isNonEmptyString(config.mailbox_address) || !config.mailbox_address.includes('@')) {
    errors.push({
      field: 'config.mailbox_address',
      message: 'mailbox_address must be a valid email-like string',
    });
  }

  validateEndpoint('inbound', inbound, config, apiCredentials, errors, {
    defaultPort: 993,
    requireFolder: true,
  });
  validateEndpoint('outbound', outbound, config, apiCredentials, errors, {
    defaultPort: 587,
    requireFromAddress: true,
  });

  if (sync.cursor_strategy !== undefined && !isNonEmptyString(sync.cursor_strategy)) {
    errors.push({
      field: 'config.sync.cursor_strategy',
      message: 'sync.cursor_strategy must be a non-empty string when provided',
    });
  }

  if (
    sync.raw_retention_days !== undefined &&
    (!Number.isInteger(sync.raw_retention_days) || sync.raw_retention_days < 0)
  ) {
    errors.push({
      field: 'config.sync.raw_retention_days',
      message: 'sync.raw_retention_days must be an integer >= 0 when provided',
    });
  }

  validateBooleanMap('config.features', features, errors);

  if (errors.length > 0) {
    return { valid: false, errors, normalized: null };
  }

  const normalized = {
    tenant_id: tenantId || null,
    provider_type: config.provider_type,
    provider_name: config.provider_name,
    mailbox_id: config.mailbox_id,
    mailbox_address: config.mailbox_address,
    inbound: {
      host: inbound.host,
      port: inbound.port ?? 993,
      secure: inbound.secure !== false,
      auth_mode: inbound.auth_mode || 'password',
      folder: inbound.folder || 'INBOX',
      poll_interval_ms: inbound.poll_interval_ms ?? null,
    },
    outbound: {
      host: outbound.host,
      port: outbound.port ?? 587,
      secure: outbound.secure === true,
      auth_mode: outbound.auth_mode || 'password',
      from_address: outbound.from_address,
      reply_to_address: outbound.reply_to_address || null,
    },
    sync: {
      cursor_strategy: sync.cursor_strategy || 'uid',
      raw_retention_days: sync.raw_retention_days ?? 30,
      replay_enabled: sync.replay_enabled !== false,
    },
    features: {
      inbound_enabled: features.inbound_enabled !== false,
      outbound_enabled: features.outbound_enabled !== false,
      lead_capture_enabled: features.lead_capture_enabled !== false,
      meeting_scheduling_enabled: features.meeting_scheduling_enabled !== false,
    },
  };

  return { valid: true, errors: [], normalized };
}

export function buildCommunicationsProviderConnection(record = {}) {
  const validation = validateCommunicationsProviderConfig(record);
  if (!validation.valid) {
    const error = new Error('Invalid communications provider configuration');
    error.code = 'communications_provider_config_invalid';
    error.details = validation.errors;
    throw error;
  }

  const connection = {
    tenant_id: record.tenant_id || null,
    integration_id: record.id || null,
    config: validation.normalized,
    api_credentials: isPlainObject(record.api_credentials) ? record.api_credentials : {},
  };

  const adapter = createCommunicationsProviderAdapter(connection);
  assertCommunicationsProviderAdapter(adapter);

  return {
    connection,
    adapter,
  };
}

function validateEndpoint(prefix, endpoint, config, apiCredentials, errors, options = {}) {
  if (!isPlainObject(endpoint)) {
    errors.push({ field: `config.${prefix}`, message: `${prefix} configuration is required` });
    return;
  }

  if (!isNonEmptyString(endpoint.host)) {
    errors.push({ field: `config.${prefix}.host`, message: `${prefix}.host is required` });
  }

  if (!isValidPort(endpoint.port ?? options.defaultPort)) {
    errors.push({
      field: `config.${prefix}.port`,
      message: `${prefix}.port must be an integer between 1 and 65535`,
    });
  }

  if (endpoint.secure !== undefined && typeof endpoint.secure !== 'boolean') {
    errors.push({
      field: `config.${prefix}.secure`,
      message: `${prefix}.secure must be a boolean when provided`,
    });
  }

  if (endpoint.auth_mode !== undefined && !isNonEmptyString(endpoint.auth_mode)) {
    errors.push({
      field: `config.${prefix}.auth_mode`,
      message: `${prefix}.auth_mode must be a non-empty string when provided`,
    });
  }

  if (options.requireFolder && endpoint.folder !== undefined && !isNonEmptyString(endpoint.folder)) {
    errors.push({
      field: `config.${prefix}.folder`,
      message: `${prefix}.folder must be a non-empty string when provided`,
    });
  }

  if (
    options.requireFolder &&
    endpoint.poll_interval_ms !== undefined &&
    (!Number.isInteger(endpoint.poll_interval_ms) || endpoint.poll_interval_ms <= 0)
  ) {
    errors.push({
      field: `config.${prefix}.poll_interval_ms`,
      message: `${prefix}.poll_interval_ms must be a positive integer when provided`,
    });
  }

  if (
    options.requireFromAddress &&
    (!isNonEmptyString(endpoint.from_address) || !endpoint.from_address.includes('@'))
  ) {
    errors.push({
      field: `config.${prefix}.from_address`,
      message: `${prefix}.from_address must be a valid email-like string`,
    });
  }

  const credentialSourceValid =
    hasCredentialPair(apiCredentials, prefix) || hasSecretRefs(config, prefix);

  if (!credentialSourceValid) {
    errors.push({
      field: `credentials.${prefix}`,
      message:
        `${prefix} credentials require either api_credentials.${prefix}_username/${prefix}_password or config.${prefix}_username_secret_ref/${prefix}_password_secret_ref`,
    });
  }
}

function validateBooleanMap(fieldPrefix, value, errors) {
  for (const [key, entry] of Object.entries(value || {})) {
    if (typeof entry !== 'boolean') {
      errors.push({
        field: `${fieldPrefix}.${key}`,
        message: `${fieldPrefix}.${key} must be a boolean when provided`,
      });
    }
  }
}

export default {
  isCommunicationsProviderIntegration,
  validateCommunicationsProviderConfig,
  buildCommunicationsProviderConnection,
};
