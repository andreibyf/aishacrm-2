import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeveloperCapabilityResponse,
  normalizeDeveloperCapabilityRequest,
} from '../../routes/devai.js';

describe('devai execute route helpers', () => {
  test('rejects non-object input before capability execution', () => {
    const result = normalizeDeveloperCapabilityRequest(
      {
        capability: 'dev:read_file',
        input: 'backend/routes/ai.js',
      },
      'service-role',
    );

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.code, 'INVALID_INPUT');
  });

  test('rejects invalid requested_by values', () => {
    const result = normalizeDeveloperCapabilityRequest({
      capability: 'dev:read_file',
      input: { path: 'backend/routes/ai.js' },
      requested_by: 'service-role',
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.code, 'INVALID_REQUESTED_BY');
  });

  test('preserves valid requested_by UUID and falls back to null for non-UUID service users', () => {
    const explicit = normalizeDeveloperCapabilityRequest({
      capability: 'dev:read_file',
      input: { path: 'backend/routes/ai.js' },
      requested_by: '11111111-1111-4111-8111-111111111111',
    });
    assert.equal(explicit.ok, true);
    assert.equal(explicit.requestedBy, '11111111-1111-4111-8111-111111111111');

    const fallback = normalizeDeveloperCapabilityRequest(
      {
        capability: 'dev:read_file',
        input: { path: 'backend/routes/ai.js' },
      },
      'service-role',
    );
    assert.equal(fallback.ok, true);
    assert.equal(fallback.requestedBy, null);
  });

  test('maps approval-required results to accepted response', () => {
    const response = buildDeveloperCapabilityResponse('dev:apply_patch', {
      type: 'approval_required',
      approval_id: 'abc',
    });

    assert.equal(response.statusCode, 202);
    assert.equal(response.body.status, 'approval_required');
  });

  test('maps invalid input results to HTTP 400 instead of success', () => {
    const response = buildDeveloperCapabilityResponse('dev:read_file', {
      error: 'path must be a non-empty string',
      code: 'INVALID_INPUT',
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.status, 'error');
    assert.equal(response.body.code, 'INVALID_INPUT');
  });
});
