export const COMMUNICATIONS_PROVIDER_TYPES = Object.freeze({
  IMAP_SMTP: 'imap_smtp',
});

export const COMMUNICATIONS_PROVIDER_METHODS = Object.freeze([
  'fetchInboundMessages',
  'acknowledgeCursor',
  'sendMessage',
  'normalizeProviderError',
  'getConnectionHealth',
]);
import { loadImapSmtpAdapter } from './adapters/imapSmtpAdapter.js';

export function createCommunicationsProviderAdapter(connection) {
  const providerType = connection?.config?.provider_type;

  switch (providerType) {
    case COMMUNICATIONS_PROVIDER_TYPES.IMAP_SMTP:
      return loadImapSmtpAdapter(connection);
    default: {
      throw new Error(
        `Unsupported communications provider type: ${providerType || 'undefined'}`,
      );
    }
  }
}

export function assertCommunicationsProviderAdapter(adapter) {
  const missingMethods = COMMUNICATIONS_PROVIDER_METHODS.filter(
    (methodName) => typeof adapter?.[methodName] !== 'function',
  );

  if (missingMethods.length > 0) {
    throw new Error(
      `Invalid communications provider adapter: missing methods ${missingMethods.join(', ')}`,
    );
  }

  return true;
}

export function normalizeCommunicationsProviderError(error, context = {}) {
  return {
    provider_type: context.provider_type || null,
    provider_name: context.provider_name || null,
    operation: context.operation || null,
    code: error?.code || error?.statusCode || error?.status || 'provider_error',
    message: error?.message || 'Unknown provider error',
    retryable: Boolean(error?.retryable),
  };
}

export default {
  COMMUNICATIONS_PROVIDER_TYPES,
  COMMUNICATIONS_PROVIDER_METHODS,
  createCommunicationsProviderAdapter,
  assertCommunicationsProviderAdapter,
  normalizeCommunicationsProviderError,
};
