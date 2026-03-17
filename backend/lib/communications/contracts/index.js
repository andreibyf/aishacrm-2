export {
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
} from './providerAdapterContract.js';

export {
  CURSOR_STRATEGIES,
  DEFAULT_RAW_RETENTION_DAYS,
  MIN_RAW_RETENTION_DAYS,
  MAX_RAW_RETENTION_DAYS,
  validateSyncCursor,
  validateSyncState,
  validateRetentionPolicy,
  buildDefaultSyncState,
  buildRetentionPolicy,
  isWithinReplayWindow,
} from './syncStateContract.js';

export {
  SAFETY_VERDICTS,
  THREAT_CATEGORIES,
  AUTH_RESULT_TYPES,
  AUTH_RESULT_VALUES,
  validateSafetyClassification,
  validateAuthResult,
  buildDefaultSafetyClassification,
  classifyFromHeaders,
  parseSpamScore,
  parseAuthenticationResults,
} from './inboundSafetyContract.js';
