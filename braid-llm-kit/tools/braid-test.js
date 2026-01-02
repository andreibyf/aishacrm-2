#!/usr/bin/env node
/**
 * Braid Testing Framework
 * Property-based testing for pure functions, effect mocking for !net,clock
 */

/* eslint-env node */
/* global Buffer, process */

import { parse } from './braid-parse.js';
import { transpileToJS } from './braid-transpile.js';
import { CRM_POLICIES } from './braid-rt.js';

// Mock effect dependencies for testing
function createMockDeps(overrides = {}) {
  return {
    http: {
      get: overrides.http?.get || (async () => ({ tag: 'Ok', data: { test: true } })),
      post: overrides.http?.post || (async () => ({ tag: 'Ok', data: { created: true } })),
      put: overrides.http?.put || (async () => ({ tag: 'Ok', data: { updated: true } })),
      delete: overrides.http?.delete || (async () => ({ tag: 'Ok', data: { deleted: true } }))
    },
    clock: {
      now: overrides.clock?.now || (() => '2025-01-01T00:00:00.000Z'),
      sleep: overrides.clock?.sleep || (async (ms) => ms)
    },
    fs: null, // Disabled
    rng: {
      random: overrides.rng?.random || (() => 0.5),
      uuid: overrides.rng?.uuid || (() => '00000000-0000-0000-0000-000000000000')
    }
  };
}

// Test runner
class BraidTestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n🧪 Running ${this.tests.length} Braid tests...\n`);
    
    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`✅ ${name}`);
      } catch (error) {
        this.failed++;
        console.log(`❌ ${name}`);
        console.log(`   ${error.message}`);
        if (error.stack) console.log(`   ${error.stack.split('\n')[1]}`);
      }
    }
    
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
    return this.failed === 0;
  }
}

// Assertion helpers
function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${message}\n  Expected: ${e}\n  Actual: ${a}`);
  }
}

function assertOk(result, message = 'Expected Ok result') {
  if (result.tag !== 'Ok') {
    throw new Error(`${message}\n  Got: ${JSON.stringify(result)}`);
  }
}

function assertErr(result, message = 'Expected Err result') {
  if (result.tag !== 'Err') {
    throw new Error(`${message}\n  Got: ${JSON.stringify(result)}`);
  }
}

// Property-based test generators
function* integers(min = 0, max = 100, count = 20) {
  for (let i = 0; i < count; i++) {
    yield Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

function* strings(length = 10, count = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < count; i++) {
    let s = '';
    for (let j = 0; j < length; j++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    yield s;
  }
}

// Test Suite
async function runTests() {
  const runner = new BraidTestRunner();

  runner.test('Parser: Type declarations', async () => {
    const source = `
      type Account = { id: String, name: String }
      type Result = Ok { value: JSONB } | Err { error: String }
    `;
    const ast = parse(source);
    assertEqual(ast.items.length, 2, 'Should parse 2 type declarations');
    assertEqual(ast.items[0].type, 'TypeDecl');
    assertEqual(ast.items[0].name, 'Account');
  });

  runner.test('Transpiler: Import generation', async () => {
    const source = `
      import { Ok, Err } from "./lib.js"
      fn test() -> Number {
        return 42;
      }
    `;
    const ast = parse(source);
    const { code } = transpileToJS(ast);
    if (!code.includes('import { Ok, Err } from "./lib.js"')) {
      throw new Error('Transpiler should generate import statement for .js files');
    }
  });
  
  // Test 3: Effect enforcement
  runner.test('Runtime: Effect denial', async () => {
    const policy = { allow_effects: ['clock'], audit_log: false };
    const { cap } = await import('./braid-rt.js');
    
    try {
      cap(policy, 'net');
      throw new Error('Should have thrown capability error');
    } catch (error) {
      if (!error.message.includes('denied')) {
        throw error;
      }
    }
  });

  runner.test('Runtime: Tenant isolation injection', async () => {
    const policy = {
      ...CRM_POLICIES.READ_ONLY,
      context: { tenant_id: 'test-tenant', user_id: 'user-123' }
    };
    const mockDeps = createMockDeps({
      http: {
        get: async (_url, opts) => {
          assertEqual(opts.params.tenant_id, 'test-tenant', 'Tenant ID should be injected');
          return { tag: 'Ok', data: {} };
        }
      }
    });
    
    const { IO } = await import('./braid-rt.js');
    const io = IO(policy, mockDeps);
    await io.http.get('/test', { params: {} });
  });
  
  // Test 5: Result type pattern matching
  runner.test('Transpiler: Match expression', async () => {
    const source = `
      fn handleResult(r: Result) -> String {
        return match r {
          Ok{value} => value,
          Err{error} => error,
          _ => "unknown"
        };
      }
    `;
    const ast = parse(source);
    const { code } = transpileToJS(ast);
    if (!code.includes('switch')) {
      throw new Error('Match should transpile to switch');
    }
  });

  runner.test('Property: Array length preservation', async () => {
    const source = `
      fn doubleArray(arr: Array) -> Result {
        return Ok(map(arr, (x) => x * 2));
      }
    `;
    const ast = parse(source);
    // Use absolute path for runtimeImport to work with data URLs
    const rtUrl = new URL('./braid-rt.js', import.meta.url).href;
    const { code } = transpileToJS(ast, { pure: true, runtimeImport: rtUrl });
    const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    const module = await import(dataUrl);
    
    for (const len of integers(0, 50, 10)) {
      const input = Array.from({ length: len }, (_, i) => i);
      const result = await module.doubleArray(input);
      assertEqual(result.value.length, len, `Array length should be preserved for ${len} elements`);
    }
  });

  runner.test('Integration: Mocked HTTP call', async () => {
    const policy = {
      ...CRM_POLICIES.READ_ONLY,
      context: { tenant_id: 'test-tenant' }
    };
    const mockDeps = createMockDeps({
      http: {
        get: async () => ({ 
          tag: 'Ok', 
          data: { accounts: [{ id: '1', name: 'Test Corp' }] } 
        })
      }
    });
    
    const { IO } = await import('./braid-rt.js');
    const io = IO(policy, mockDeps);
    const result = await io.http.get('/api/snapshot');
    
    assertOk(result, 'Mock HTTP should return Ok');
    assertEqual(result.data.accounts[0].name, 'Test Corp');
  });
  
  return await runner.run();
}

// CLI
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  runTests().then(success => process.exit(success ? 0 : 1));
}

export { BraidTestRunner, assertEqual, assertOk, assertErr, createMockDeps, integers, strings };
