import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from '../../lib/communications/contracts/providerAdapterContract.js';

function buildConformingAdapter() {
  return {
    providerType: 'test_provider',
    fetchInboundMessages(_options) {
      return { ok: true, provider_type: 'test_provider', messages: [], cursor: null };
    },
    acknowledgeCursor(_cursor) {
      return { ok: true, provider_type: 'test_provider', status: 'cursor_acknowledged' };
    },
    sendMessage(_msg) {
      return { ok: true, provider_type: 'test_provider', message_id: 'abc' };
    },
    normalizeProviderError(_err) {
      return { code: 'test', message: 'test error', retryable: false };
    },
    getConnectionHealth() {
      return { ok: true, provider_type: 'test_provider', status: 'connected' };
    },
  };
}

describe('providerAdapterContract', () => {
  describe('assertAdapterConformsToContract', () => {
    it('accepts a conforming adapter', () => {
      assert.equal(assertAdapterConformsToContract(buildConformingAdapter()), true);
    });

    it('rejects null adapter', () => {
      assert.throws(() => assertAdapterConformsToContract(null), /non-null object/);
    });

    it('rejects adapter missing a required method', () => {
      const adapter = buildConformingAdapter();
      delete adapter.sendMessage;
      assert.throws(() => assertAdapterConformsToContract(adapter), /sendMessage/);
    });

    it('rejects adapter without providerType', () => {
      const adapter = buildConformingAdapter();
      delete adapter.providerType;
      assert.throws(() => assertAdapterConformsToContract(adapter), /providerType/);
    });

    it('accepts adapter with default-parameter methods', () => {
      const adapter = {
        providerType: 'defaults_provider',
        fetchInboundMessages(options = {}) {
          return { ok: true, provider_type: 'defaults_provider', messages: [], cursor: null };
        },
        acknowledgeCursor(cursor = null) {
          return { ok: true, provider_type: 'defaults_provider', status: 'cursor_acknowledged' };
        },
        sendMessage(msg = {}) {
          return { ok: true, provider_type: 'defaults_provider', message_id: 'x' };
        },
        normalizeProviderError(err = null, context = {}) {
          return { code: 'test', message: 'test error', retryable: false };
        },
        getConnectionHealth() {
          return { ok: true, provider_type: 'defaults_provider', status: 'connected' };
        },
      };
      assert.equal(assertAdapterConformsToContract(adapter), true);
    });
  });

  describe('getAdapterCapabilities', () => {
    it('returns all five capabilities for a conforming adapter', () => {
      const caps = getAdapterCapabilities(buildConformingAdapter());
      assert.equal(caps.length, 5);
      assert.ok(caps.includes(ADAPTER_CAPABILITIES.INBOUND_FETCH));
      assert.ok(caps.includes(ADAPTER_CAPABILITIES.OUTBOUND_SEND));
    });

    it('returns partial list for incomplete adapter', () => {
      const caps = getAdapterCapabilities({ fetchInboundMessages() {} });
      assert.equal(caps.length, 1);
      assert.equal(caps[0], ADAPTER_CAPABILITIES.INBOUND_FETCH);
    });
  });

  describe('validateFetchResult', () => {
    it('accepts a valid fetch result', () => {
      const result = validateFetchResult({
        ok: true,
        provider_type: 'imap_smtp',
        messages: [],
        cursor: { strategy: 'uid', value: 100 },
      });
      assert.equal(result.valid, true);
    });

    it('rejects non-object result', () => {
      const result = validateFetchResult(null);
      assert.equal(result.valid, false);
    });

    it('rejects missing messages array', () => {
      const result = validateFetchResult({ ok: true, provider_type: 'imap_smtp' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('messages')));
    });
  });

  describe('validateInboundMessage', () => {
    it('accepts a valid message', () => {
      const result = validateInboundMessage({
        from: { name: 'Test', email: 'test@example.com' },
        to: [{ name: '', email: 'me@example.com' }],
        subject: 'Hello',
      });
      assert.equal(result.valid, true);
    });

    it('rejects message without from', () => {
      const result = validateInboundMessage({ to: [], subject: '' });
      assert.equal(result.valid, false);
    });
  });

  describe('validateAckResult', () => {
    it('accepts valid ack', () => {
      const result = validateAckResult({ ok: true, provider_type: 'imap_smtp' });
      assert.equal(result.valid, true);
    });
  });

  describe('validateSendResult', () => {
    it('accepts valid send result', () => {
      const result = validateSendResult({ ok: true, provider_type: 'imap_smtp', message_id: 'x' });
      assert.equal(result.valid, true);
    });
  });

  describe('validateNormalizedError', () => {
    it('accepts valid normalized error', () => {
      const result = validateNormalizedError({
        code: 'timeout',
        message: 'timed out',
        retryable: true,
      });
      assert.equal(result.valid, true);
    });

    it('rejects missing retryable', () => {
      const result = validateNormalizedError({ code: 'x', message: 'y' });
      assert.equal(result.valid, false);
    });
  });

  describe('validateHealthResult', () => {
    it('accepts valid health', () => {
      const result = validateHealthResult({
        ok: true,
        provider_type: 'imap_smtp',
        status: 'connected',
      });
      assert.equal(result.valid, true);
    });

    it('rejects missing status', () => {
      const result = validateHealthResult({ ok: true, provider_type: 'imap_smtp' });
      assert.equal(result.valid, false);
    });
  });

  describe('constants', () => {
    it('exports all lifecycle states', () => {
      assert.equal(ADAPTER_LIFECYCLE_STATES.CREATED, 'created');
      assert.equal(ADAPTER_LIFECYCLE_STATES.CONNECTED, 'connected');
      assert.equal(ADAPTER_LIFECYCLE_STATES.DISCONNECTED, 'disconnected');
      assert.equal(ADAPTER_LIFECYCLE_STATES.ERROR, 'error');
    });

    it('exports all required method names', () => {
      assert.ok(Array.isArray(REQUIRED_ADAPTER_METHODS));
      assert.ok(REQUIRED_ADAPTER_METHODS.includes('fetchInboundMessages'));
      assert.ok(REQUIRED_ADAPTER_METHODS.includes('sendMessage'));
      assert.equal(REQUIRED_ADAPTER_METHODS.length, 5);
    });
  });
});
