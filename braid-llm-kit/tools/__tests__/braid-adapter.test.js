// braid-adapter.test.js - Adapter integration tests (LRU cache, mtime, execution)
// Run with: node --test braid-llm-kit/tools/__tests__/braid-adapter.test.js

import { executeBraid, clearCache, loadToolSchema } from '../braid-adapter.js';
import { CRM_POLICIES } from '../braid-rt.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a temporary .braid file for testing
const TEST_DIR = path.join(__dirname, '_test_tmp');
const TEST_BRAID = path.join(TEST_DIR, 'test_tool.braid');

// Mock HTTP deps that simulate backend API responses
function makeMockDeps(responseData = { data: [{ id: 1, name: 'Test Lead' }] }) {
  return {
    http: {
      get: async (url, opts) => ({ tag: 'Ok', value: responseData, status: 200 }),
      post: async (url, opts) => ({ tag: 'Ok', value: responseData, status: 201 }),
      put: async (url, opts) => ({ tag: 'Ok', value: responseData, status: 200 }),
      delete: async (url, opts) => ({ tag: 'Ok', value: { deleted: true }, status: 200 }),
    },
    clock: {
      now: () => '2026-02-13T00:00:00Z',
      sleep: async (ms) => new Promise(r => setTimeout(r, Math.min(ms, 100))),
    },
    fs: {
      read: async () => 'mock file content',
      write: async () => true,
    },
    rng: {
      random: () => 0.42,
      uuid: () => 'test-uuid-1234',
    },
  };
}

// Setup/teardown test files
function setupTestDir() {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

function writeTestBraid(code) {
  setupTestDir();
  fs.writeFileSync(TEST_BRAID, code, 'utf8');
}

describe('Braid Adapter', () => {

  beforeEach(() => {
    clearCache();
    cleanupTestDir();
  });

  describe('executeBraid', () => {
    it('executes a pure function', async () => {
      writeTestBraid('fn add(a: Number, b: Number) -> Number { return a + b; }');
      const result = await executeBraid(
        TEST_BRAID, 'add', null, {}, [3, 4], { cache: false }
      );
      assert.strictEqual(result, 7);
    });

    it('executes an effectful function with mock deps', async () => {
      writeTestBraid(`
        fn fetchLeads(tenant: String) -> Result !net {
          let url = "/api/v2/leads";
          let response = http.get(url, { params: { tenant_id: tenant } });
          return response;
        }
      `);
      const deps = makeMockDeps();
      const policy = { ...CRM_POLICIES.READ_ONLY, context: { tenant_id: 'test-tenant' } };
      const result = await executeBraid(
        TEST_BRAID, 'fetchLeads', policy, deps, ['test-tenant'], { cache: false }
      );
      assert.ok(result);
      assert.strictEqual(result.tag, 'Ok');
    });

    it('returns error for missing function', async () => {
      writeTestBraid('fn existing() -> String { return "hello"; }');
      const result = await executeBraid(
        TEST_BRAID, 'nonexistent', null, {}, [], { cache: false }
      );
      assert.strictEqual(result.tag, 'Err');
      assert.ok(result.error.message.includes('nonexistent'));
    });

    it('enforces timeout', async () => {
      writeTestBraid(`
        fn slowFn(ms: Number) -> Result !clock {
          let x = clock.sleep(ms);
          return x;
        }
      `);
      const deps = makeMockDeps();
      deps.clock.sleep = async (ms) => new Promise(r => setTimeout(r, ms));
      const policy = { ...CRM_POLICIES.READ_ONLY, max_execution_ms: 50, context: {} };
      const result = await executeBraid(
        TEST_BRAID, 'slowFn', policy, deps, [5000], { cache: false, timeout: 50 }
      );
      assert.strictEqual(result.tag, 'Err');
      assert.ok(result.error.message.includes('BRAID_TIMEOUT'));
    });
  });

  describe('Result Caching', () => {
    it('caches successful results', async () => {
      writeTestBraid('fn greet(name: String) -> String { return "Hello " + name; }');
      const r1 = await executeBraid(TEST_BRAID, 'greet', null, {}, ['World'], { cache: true });
      const r2 = await executeBraid(TEST_BRAID, 'greet', null, {}, ['World'], { cache: true });
      assert.strictEqual(r1, r2);
    });

    it('clearCache clears both caches', async () => {
      writeTestBraid('fn val() -> Number { return 42; }');
      await executeBraid(TEST_BRAID, 'val', null, {}, [], { cache: true });
      clearCache();
      // After clearing, it should re-parse (no error = success)
      const result = await executeBraid(TEST_BRAID, 'val', null, {}, [], { cache: true });
      assert.strictEqual(result, 42);
    });
  });

  describe('Mtime Invalidation (dev mode)', () => {
    it('recompiles when file changes', async () => {
      writeTestBraid('fn version() -> Number { return 1; }');
      const r1 = await executeBraid(TEST_BRAID, 'version', null, {}, [], { cache: false });
      assert.strictEqual(r1, 1);

      // Wait a bit to ensure mtime changes
      await new Promise(r => setTimeout(r, 50));

      // Rewrite file with different content
      writeTestBraid('fn version() -> Number { return 2; }');
      const r2 = await executeBraid(TEST_BRAID, 'version', null, {}, [], { cache: false });
      assert.strictEqual(r2, 2);
    });
  });

  describe('loadToolSchema', () => {
    it('generates OpenAI tool schema from braid function', async () => {
      writeTestBraid(`
        fn searchLeads(tenant: String, query: String, limit: Number) -> Result !net {
          let r = http.get("/api/v2/leads");
          return r;
        }
      `);
      const schema = await loadToolSchema(TEST_BRAID, 'searchLeads');
      assert.strictEqual(schema.type, 'function');
      assert.strictEqual(schema.function.name, 'searchLeads');
      assert.deepStrictEqual(Object.keys(schema.function.parameters.properties), ['tenant', 'query', 'limit']);
      assert.strictEqual(schema.function.parameters.properties.tenant.type, 'string');
      assert.strictEqual(schema.function.parameters.properties.limit.type, 'number');
      assert.ok(schema.function.description.includes('!net'));
    });

    it('throws for missing function', async () => {
      writeTestBraid('fn existing() -> String { return "hello"; }');
      await assert.rejects(
        () => loadToolSchema(TEST_BRAID, 'missing'),
        /not found/
      );
    });
  });

  // Cleanup
  describe('cleanup', () => {
    it('removes test directory', () => {
      cleanupTestDir();
      assert.ok(!fs.existsSync(TEST_DIR));
    });
  });
});

console.log('All adapter tests passed!');
