import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchJsonWithHandling,
  getErrorMessage,
  isAbortError,
  logApiError,
} from './apiErrorHandling';
import { logError } from './devLogger';

vi.mock('./devLogger', () => ({
  logError: vi.fn(),
}));

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(text, status = 500) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

describe('apiErrorHandling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  describe('fetchJsonWithHandling', () => {
    it('returns parsed JSON for successful response', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ success: true, value: 42 }, 200));
      const result = await fetchJsonWithHandling('/api/test');
      expect(result).toEqual({ success: true, value: 42 });
    });

    it('returns null for empty successful response body', async () => {
      globalThis.fetch.mockResolvedValueOnce(
        new Response('', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const result = await fetchJsonWithHandling('/api/test');
      expect(result).toBeNull();
    });

    it('returns response metadata when includeResponseMeta is enabled', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ created: true }, 201));
      const result = await fetchJsonWithHandling('/api/test', {}, { includeResponseMeta: true });
      expect(result).toEqual({
        data: { created: true },
        status: 201,
        ok: true,
      });
    });

    it('throws ApiRequestError with parsed JSON message for non-OK response', async () => {
      globalThis.fetch.mockResolvedValueOnce(jsonResponse({ error: 'Denied' }, 403));
      await expect(fetchJsonWithHandling('/api/secure')).rejects.toMatchObject({
        name: 'ApiRequestError',
        message: 'Denied',
        status: 403,
      });
    });

    it('throws ApiRequestError with text body message for non-JSON error response', async () => {
      globalThis.fetch.mockResolvedValueOnce(textResponse('Gateway down', 502));
      await expect(fetchJsonWithHandling('/api/down')).rejects.toMatchObject({
        name: 'ApiRequestError',
        message: 'Gateway down',
        status: 502,
      });
    });

    it('wraps network failures as NetworkRequestError', async () => {
      globalThis.fetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      await expect(fetchJsonWithHandling('/api/network')).rejects.toMatchObject({
        name: 'NetworkRequestError',
        message: 'connect ECONNREFUSED',
      });
    });

    it('rethrows AbortError unchanged', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      globalThis.fetch.mockRejectedValueOnce(abortError);
      await expect(fetchJsonWithHandling('/api/abort')).rejects.toBe(abortError);
    });

    it('throws ResponseParseError for invalid JSON payload', async () => {
      globalThis.fetch.mockResolvedValueOnce(
        new Response('{bad json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(fetchJsonWithHandling('/api/bad-json')).rejects.toMatchObject({
        name: 'ResponseParseError',
        message: 'Invalid server response',
      });
    });
  });

  describe('helpers', () => {
    it('getErrorMessage resolves strings and fallbacks', () => {
      expect(getErrorMessage('plain error')).toBe('plain error');
      expect(getErrorMessage(new Error('boom'))).toBe('boom');
      expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    });

    it('isAbortError detects abort signatures', () => {
      expect(isAbortError({ name: 'AbortError' })).toBe(true);
      expect(isAbortError({ code: 'ABORT_ERR' })).toBe(true);
      expect(isAbortError({ name: 'TypeError' })).toBe(false);
    });

    it('logApiError forwards structured context to dev logger', () => {
      const err = new Error('request failed');
      err.name = 'ApiRequestError';
      err.status = 500;
      err.payload = { error: 'request failed' };

      logApiError('test.scope', err, { requestId: 'abc-123' });

      expect(logError).toHaveBeenCalledWith('[API Error]', {
        context: 'test.scope',
        message: 'request failed',
        name: 'ApiRequestError',
        status: 500,
        payload: { error: 'request failed' },
        requestId: 'abc-123',
      });
    });
  });
});
