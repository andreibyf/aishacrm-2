import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeveloperCapabilityExecutor,
  DEVELOPER_CAPABILITY_TO_TOOL,
  mapDeveloperCapability,
} from '../../lib/developerToolsProvider.js';

describe('developerToolsProvider', () => {
  test('maps low-risk read capability to existing Developer AI tool args', () => {
    const mapped = mapDeveloperCapability('dev:read_file', {
      path: 'backend/routes/ai.js',
      startLine: 10,
      endLine: 20,
    });

    assert.deepEqual(mapped, {
      toolName: 'read_file',
      toolArgs: {
        file_path: 'backend/routes/ai.js',
        start_line: 10,
        end_line: 20,
      },
    });
  });

  test('maps list and search capabilities to Developer AI tool schema', () => {
    assert.deepEqual(
      mapDeveloperCapability('dev:list_files', { path: 'backend', recursive: true }),
      {
        toolName: 'list_directory',
        toolArgs: {
          dir_path: 'backend',
          recursive: true,
        },
      },
    );

    assert.deepEqual(
      mapDeveloperCapability('dev:search_code', {
        query: 'developerChat',
        path: 'backend/lib',
        filePattern: '*.js',
        caseInsensitive: true,
      }),
      {
        toolName: 'search_code',
        toolArgs: {
          pattern: 'developerChat',
          directory: 'backend/lib',
          file_pattern: '*.js',
          case_insensitive: true,
        },
      },
    );
  });

  test('maps approval-gated capabilities without bypassing existing controls', () => {
    assert.deepEqual(DEVELOPER_CAPABILITY_TO_TOOL['dev:run_safe_command'], 'run_command');
    assert.deepEqual(DEVELOPER_CAPABILITY_TO_TOOL['dev:apply_patch'], 'apply_patch');

    assert.deepEqual(
      mapDeveloperCapability('dev:run_safe_command', {
        command: 'docker ps',
        workingDirectory: 'backend',
      }),
      {
        toolName: 'run_command',
        toolArgs: {
          command: 'docker ps',
          working_directory: 'backend',
          reason: 'Requested through Braid developer-tools provider',
        },
      },
    );
  });

  test('delegates execution through the injected Developer AI executor', async () => {
    const calls = [];
    const fakeExecutor = async (toolName, toolArgs, userId) => {
      calls.push({ toolName, toolArgs, userId });
      return { ok: true };
    };

    const executeDeveloperCapability = createDeveloperCapabilityExecutor(fakeExecutor);
    const result = await executeDeveloperCapability(
      'dev:read_logs',
      { target: 'backend', tail: 25, analyzePatterns: true },
      'user-123',
    );

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      {
        toolName: 'read_logs',
        toolArgs: {
          log_type: 'backend',
          lines: 25,
          filter: undefined,
          analyze_patterns: true,
          since_minutes: undefined,
        },
        userId: 'user-123',
      },
    ]);
  });

  test('returns unsupported error for unknown capability ids', async () => {
    const executeDeveloperCapability = createDeveloperCapabilityExecutor(async () => {
      throw new Error('should not be called');
    });

    const result = await executeDeveloperCapability('dev:unknown', {});

    assert.equal(result.code, 'UNSUPPORTED_CAPABILITY');
    assert.match(result.error, /Unsupported developer-tools capability/);
  });

  test('rejects invalid capability input before calling downstream executor', async () => {
    const calls = [];
    const executeDeveloperCapability = createDeveloperCapabilityExecutor(async (...args) => {
      calls.push(args);
      return { ok: true };
    });

    const result = await executeDeveloperCapability('dev:read_file', {
      startLine: 10,
    });

    assert.equal(result.code, 'INVALID_INPUT');
    assert.match(result.error, /path must be a non-empty string/);
    assert.deepEqual(calls, []);
  });
});
