// braid-rt.test.js - Runtime tests (cap, IO, tenant isolation, policies)
// Run with: node --test braid-llm-kit/tools/__tests__/braid-rt.test.js

import { Ok, Err, cap, IO, CRM_POLICIES, canAccessField, filterSensitiveFields, getAuditLog, clearAuditLog, checkType, CRMError } from '../braid-rt.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

describe('Braid Runtime', () => {

  beforeEach(() => {
    clearAuditLog();
  });

  describe('Result Constructors', () => {
    it('Ok wraps value', () => {
      const r = Ok(42);
      assert.strictEqual(r.tag, 'Ok');
      assert.strictEqual(r.value, 42);
    });

    it('Err wraps error', () => {
      const r = Err({ message: 'fail' });
      assert.strictEqual(r.tag, 'Err');
      assert.deepStrictEqual(r.error, { message: 'fail' });
    });
  });

  describe('Capability Checking (cap)', () => {
    it('allows effect in policy allow list', () => {
      const policy = { allow_effects: ['net', 'clock'], audit_log: false };
      assert.doesNotThrow(() => cap(policy, 'net'));
    });

    it('allows wildcard effect', () => {
      const policy = { allow_effects: ['*'], audit_log: false };
      assert.doesNotThrow(() => cap(policy, 'anything'));
    });

    it('denies effect not in allow list', () => {
      const policy = { allow_effects: ['net'], audit_log: false };
      assert.throws(() => cap(policy, 'fs'), /BRAID_CAP.*fs.*denied by policy/);
    });

    it('denies when no policy provided', () => {
      assert.throws(() => cap(null, 'net'), /BRAID_CAP.*no policy/);
    });

    it('logs to audit log', () => {
      const policy = { allow_effects: ['net'], audit_log: true, context: { tenant_id: 't1' } };
      cap(policy, 'net');
      const log = getAuditLog();
      assert.strictEqual(log.length, 1);
      assert.strictEqual(log[0].effect, 'net');
      assert.strictEqual(log[0].allowed, true);
      assert.strictEqual(log[0].tenant_id, 't1');
    });
  });

  describe('IO Wrapper', () => {
    it('creates http, clock, fs, rng namespaces', () => {
      const deps = {
        http: { get: async () => {}, post: async () => {} },
        clock: { now: () => 'ts' },
        fs: {},
        rng: {},
      };
      const io = IO({}, deps);
      assert.ok(io.http);
      assert.ok(io.http.get);
      assert.ok(io.http.post);
      assert.ok(io.clock);
      assert.ok(io.clock.now);
      assert.ok(io.fs);
      assert.ok(io.rng);
    });

    it('injects tenant_id when tenant_isolation is active', async () => {
      let capturedOpts = null;
      const deps = {
        http: {
          get: async (url, opts) => { capturedOpts = opts; return { data: [] }; },
        },
        clock: {},
        fs: {},
        rng: {},
      };
      const policy = {
        tenant_isolation: true,
        context: { tenant_id: 'tenant-abc' },
      };
      const io = IO(policy, deps);
      await io.http.get('/api/leads', { params: {} });
      assert.strictEqual(capturedOpts.params.tenant_id, 'tenant-abc');
    });

    it('does not override existing tenant_id', async () => {
      let capturedOpts = null;
      const deps = {
        http: {
          get: async (url, opts) => { capturedOpts = opts; return { data: [] }; },
        },
        clock: {},
        fs: {},
        rng: {},
      };
      const policy = {
        tenant_isolation: true,
        context: { tenant_id: 'policy-tenant' },
      };
      const io = IO(policy, deps);
      await io.http.get('/api/leads', { params: { tenant_id: 'explicit-tenant' } });
      assert.strictEqual(capturedOpts.params.tenant_id, 'explicit-tenant');
    });

    it('enforces timeout on slow operations', async () => {
      const deps = {
        http: {
          get: async () => new Promise(r => setTimeout(r, 5000)),
        },
        clock: {},
        fs: {},
        rng: {},
      };
      const policy = { max_execution_ms: 50 };
      const io = IO(policy, deps);
      await assert.rejects(
        () => io.http.get('/api/slow'),
        /BRAID_TIMEOUT/
      );
    });
  });

  describe('CRM Policies', () => {
    it('READ_ONLY allows net and clock', () => {
      assert.ok(CRM_POLICIES.READ_ONLY.allow_effects.includes('net'));
      assert.ok(CRM_POLICIES.READ_ONLY.allow_effects.includes('clock'));
    });

    it('READ_ONLY has tenant isolation', () => {
      assert.strictEqual(CRM_POLICIES.READ_ONLY.tenant_isolation, true);
    });

    it('WRITE_OPERATIONS allows net', () => {
      assert.ok(CRM_POLICIES.WRITE_OPERATIONS.allow_effects.includes('net'));
    });
  });

  describe('Field Permissions', () => {
    it('canAccessField returns true for permitted fields', () => {
      const result = canAccessField('admin', 'leads', 'first_name');
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('Runtime Type Checking (checkType)', () => {
    it('passes for correct string type', () => {
      assert.doesNotThrow(() => checkType('fn', 'x', 'hello', 'string'));
    });

    it('passes for correct number type', () => {
      assert.doesNotThrow(() => checkType('fn', 'x', 42, 'number'));
    });

    it('passes for correct boolean type', () => {
      assert.doesNotThrow(() => checkType('fn', 'x', true, 'boolean'));
    });

    it('throws for wrong type with BRAID_TYPE code', () => {
      assert.throws(
        () => checkType('createLead', 'name', 42, 'string'),
        (err) => err.code === 'BRAID_TYPE' && err.fn === 'createLead' && err.param === 'name'
      );
    });

    it('throws for null value', () => {
      assert.throws(
        () => checkType('fn', 'tenant', null, 'string'),
        /BRAID_TYPE.*null/
      );
    });

    it('throws for undefined value', () => {
      assert.throws(
        () => checkType('fn', 'age', undefined, 'number'),
        /BRAID_TYPE.*undefined/
      );
    });

    it('includes function and param name in error', () => {
      try {
        checkType('searchLeads', 'query', 123, 'string');
        assert.fail('should throw');
      } catch (e) {
        assert.ok(e.message.includes('searchLeads'));
        assert.ok(e.message.includes('query'));
        assert.strictEqual(e.expected, 'string');
        assert.strictEqual(e.actual, 'number');
      }
    });
  });

  describe('CRMError Constructors', () => {
    it('notFound returns structured 404 error', () => {
      const result = CRMError.notFound('Lead', 'abc-123', 'get_lead');
      assert.strictEqual(result.tag, 'Err');
      assert.strictEqual(result.error.type, 'NotFound');
      assert.strictEqual(result.error.entity, 'Lead');
      assert.strictEqual(result.error.id, 'abc-123');
      assert.strictEqual(result.error.code, 404);
    });

    it('validation returns structured 400 error', () => {
      const result = CRMError.validation('createLead', 'email', 'invalid format');
      assert.strictEqual(result.error.type, 'ValidationError');
      assert.strictEqual(result.error.field, 'email');
      assert.strictEqual(result.error.code, 400);
    });

    it('forbidden returns structured 403 error', () => {
      const result = CRMError.forbidden('delete_lead', 'user', 'admin');
      assert.strictEqual(result.error.type, 'PermissionDenied');
      assert.strictEqual(result.error.code, 403);
    });

    it('network returns structured 5xx error', () => {
      const result = CRMError.network('/api/leads', 503, 'list_leads');
      assert.strictEqual(result.error.type, 'NetworkError');
      assert.strictEqual(result.error.code, 503);
    });

    it('fromHTTP maps 404 to NotFound', () => {
      const result = CRMError.fromHTTP('/api/leads/x', 404, 'get_lead');
      assert.strictEqual(result.error.type, 'NotFound');
    });

    it('fromHTTP maps 400 to ValidationError', () => {
      const result = CRMError.fromHTTP('/api/leads', 400, 'create_lead');
      assert.strictEqual(result.error.type, 'ValidationError');
    });

    it('fromHTTP maps 403 to PermissionDenied', () => {
      const result = CRMError.fromHTTP('/api/leads', 403, 'delete_lead');
      assert.strictEqual(result.error.type, 'PermissionDenied');
    });

    it('fromHTTP maps 500 to NetworkError', () => {
      const result = CRMError.fromHTTP('/api/leads', 500, 'list_leads');
      assert.strictEqual(result.error.type, 'NetworkError');
    });
  });
});

console.log('All runtime tests passed!');
