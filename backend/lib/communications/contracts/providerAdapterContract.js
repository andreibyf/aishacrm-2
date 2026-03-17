/**
 * Provider Adapter Runtime Contract
 *
 * Defines the interface that every communications provider adapter (IMAP/SMTP,
 * Microsoft Graph, Gmail API, etc.) must implement in order to be connected to
 * the communications-worker (inbound) and communications-dispatcher (outbound).
 *
 * The contract is intentionally transport-agnostic.  It describes the shapes of
 * method arguments, return values, and error objects so that the worker and
 * dispatcher can consume any conforming adapter identically.
 */

// ---------------------------------------------------------------------------
// Provider capability constants
// ---------------------------------------------------------------------------

export const ADAPTER_CAPABILITIES = Object.freeze({
  INBOUND_FETCH: 'inbound_fetch',
  OUTBOUND_SEND: 'outbound_send',
  CURSOR_ACK: 'cursor_ack',
  HEALTH_CHECK: 'health_check',
  ERROR_NORMALIZE: 'error_normalize',
});

export const ADAPTER_LIFECYCLE_STATES = Object.freeze({
  CREATED: 'created',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
});

// ---------------------------------------------------------------------------
// Required method signatures (name → minimum arity)
// ---------------------------------------------------------------------------

export const REQUIRED_ADAPTER_METHODS = Object.freeze({
  fetchInboundMessages: 1, // (options) => FetchResult
  acknowledgeCursor: 1, // (cursor)  => AckResult
  sendMessage: 1, // (message) => SendResult
  normalizeProviderError: 1, // (error, context?) => NormalizedError
  getConnectionHealth: 0, // ()        => HealthResult
});

// ---------------------------------------------------------------------------
// Return-shape validators
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Validate the shape returned by `fetchInboundMessages`. */
export function validateFetchResult(result) {
  const errors = [];

  if (typeof result !== 'object' || result === null) {
    return { valid: false, errors: ['fetchInboundMessages must return an object'] };
  }
  if (typeof result.ok !== 'boolean') {
    errors.push('result.ok must be a boolean');
  }
  if (!isNonEmptyString(result.provider_type)) {
    errors.push('result.provider_type must be a non-empty string');
  }
  if (!Array.isArray(result.messages)) {
    errors.push('result.messages must be an array');
  }
  if (result.cursor !== undefined && result.cursor !== null) {
    if (typeof result.cursor !== 'object') {
      errors.push('result.cursor must be an object when present');
    } else {
      if (!isNonEmptyString(result.cursor.strategy)) {
        errors.push('result.cursor.strategy must be a non-empty string');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validate the shape of an individual inbound message. */
export function validateInboundMessage(msg) {
  const errors = [];

  if (typeof msg !== 'object' || msg === null) {
    return { valid: false, errors: ['message must be an object'] };
  }
  if (msg.from === undefined || msg.from === null) {
    errors.push('message.from is required');
  }
  if (!Array.isArray(msg.to)) {
    errors.push('message.to must be an array');
  }
  // subject may be empty string but must exist
  if (typeof msg.subject !== 'string') {
    errors.push('message.subject must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate the shape returned by `acknowledgeCursor`. */
export function validateAckResult(result) {
  const errors = [];

  if (typeof result !== 'object' || result === null) {
    return { valid: false, errors: ['acknowledgeCursor must return an object'] };
  }
  if (typeof result.ok !== 'boolean') {
    errors.push('result.ok must be a boolean');
  }
  if (!isNonEmptyString(result.provider_type)) {
    errors.push('result.provider_type must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate the shape returned by `sendMessage`. */
export function validateSendResult(result) {
  const errors = [];

  if (typeof result !== 'object' || result === null) {
    return { valid: false, errors: ['sendMessage must return an object'] };
  }
  if (typeof result.ok !== 'boolean') {
    errors.push('result.ok must be a boolean');
  }
  if (!isNonEmptyString(result.provider_type)) {
    errors.push('result.provider_type must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate the shape returned by `normalizeProviderError`. */
export function validateNormalizedError(err) {
  const errors = [];

  if (typeof err !== 'object' || err === null) {
    return { valid: false, errors: ['normalizedError must be an object'] };
  }
  if (typeof err.code !== 'string') {
    errors.push('normalizedError.code must be a string');
  }
  if (typeof err.message !== 'string') {
    errors.push('normalizedError.message must be a string');
  }
  if (typeof err.retryable !== 'boolean') {
    errors.push('normalizedError.retryable must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

/** Validate the shape returned by `getConnectionHealth`. */
export function validateHealthResult(result) {
  const errors = [];

  if (typeof result !== 'object' || result === null) {
    return { valid: false, errors: ['getConnectionHealth must return an object'] };
  }
  if (typeof result.ok !== 'boolean') {
    errors.push('result.ok must be a boolean');
  }
  if (!isNonEmptyString(result.provider_type)) {
    errors.push('result.provider_type must be a non-empty string');
  }
  if (!isNonEmptyString(result.status)) {
    errors.push('result.status must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Adapter assertion (structural conformance check)
// ---------------------------------------------------------------------------

/**
 * Assert that an adapter object conforms to the full runtime contract.
 *
 * Throws on the first violation.  Returns `true` if everything passes.
 */
export function assertAdapterConformsToContract(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('Provider adapter must be a non-null object');
  }

  for (const [methodName, minArity] of Object.entries(REQUIRED_ADAPTER_METHODS)) {
    if (typeof adapter[methodName] !== 'function') {
      throw new Error(`Provider adapter missing required method: ${methodName}`);
    }
    if (adapter[methodName].length < minArity) {
      throw new Error(
        `Provider adapter method ${methodName} must accept at least ${minArity} argument(s)`,
      );
    }
  }

  if (!isNonEmptyString(adapter.providerType)) {
    throw new Error('Provider adapter must expose a non-empty providerType string');
  }

  return true;
}

/**
 * List the capabilities that a conforming adapter supports.
 *
 * By default every adapter supports all five capabilities.  This helper
 * exists so callers can do feature-checks without hard-coding method names.
 */
export function getAdapterCapabilities(adapter) {
  const caps = [];
  if (typeof adapter?.fetchInboundMessages === 'function')
    caps.push(ADAPTER_CAPABILITIES.INBOUND_FETCH);
  if (typeof adapter?.sendMessage === 'function') caps.push(ADAPTER_CAPABILITIES.OUTBOUND_SEND);
  if (typeof adapter?.acknowledgeCursor === 'function') caps.push(ADAPTER_CAPABILITIES.CURSOR_ACK);
  if (typeof adapter?.getConnectionHealth === 'function')
    caps.push(ADAPTER_CAPABILITIES.HEALTH_CHECK);
  if (typeof adapter?.normalizeProviderError === 'function')
    caps.push(ADAPTER_CAPABILITIES.ERROR_NORMALIZE);
  return caps;
}

export default {
  ADAPTER_CAPABILITIES,
  ADAPTER_LIFECYCLE_STATES,
  REQUIRED_ADAPTER_METHODS,
  assertAdapterConformsToContract,
  getAdapterCapabilities,
  validateFetchResult,
  validateInboundMessage,
  validateAckResult,
  validateSendResult,
  validateNormalizedError,
  validateHealthResult,
};
