/**
 * Tests for tenantCanonicalResolver - Tenant UUID/slug resolution with caching
 * Critical for tenant isolation and RLS enforcement
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  resolveCanonicalTenant,
  isUuid,
  getTenantResolveCacheStats,
  clearTenantResolveCache
} from '../../lib/tenantCanonicalResolver.js';
import { initSupabaseForTests } from '../setup.js';

describe('tenantCanonicalResolver', () => {
  let supabaseAvailable = false;

  before(async () => {
    supabaseAvailable = await initSupabaseForTests();
    if (!supabaseAvailable) {
      console.warn('[tenantCanonicalResolver.test] Skipping Supabase-dependent tests - credentials not available');
    }
  });

  beforeEach(() => {
    // Clear cache before each test to ensure isolation
    clearTenantResolveCache();
  });

  describe('isUuid()', () => {
    it('should return true for valid UUIDs', () => {
      const validUuids = [
        'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      ];

      for (const uuid of validUuids) {
        assert.strictEqual(isUuid(uuid), true, `${uuid} should be valid`);
      }
    });

    it('should return false for invalid UUIDs', () => {
      const invalidUuids = [
        'not-a-uuid',
        'local-tenant-001',
        '12345',
        '',
        null,
        undefined,
        'a11dfb63-4b18-4eb8-872e-747af2e37c4', // Too short
        'a11dfb63-4b18-4eb8-872e-747af2e37c466', // Too long
        'g11dfb63-4b18-4eb8-872e-747af2e37c46' // Invalid character
      ];

      for (const invalid of invalidUuids) {
        assert.strictEqual(isUuid(invalid), false, `${invalid} should be invalid`);
      }
    });

    it('should handle trimmed whitespace', () => {
      assert.strictEqual(isUuid('  a11dfb63-4b18-4eb8-872e-747af2e37c46  '), true);
    });
  });

  describe('resolveCanonicalTenant() - Unit Tests', () => {
    it('should return empty result for null/empty identifier', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      const testCases = [null, undefined, '', '  '];
      
      for (const input of testCases) {
        const result = await resolveCanonicalTenant(input);
        assert.strictEqual(result.uuid, null);
        assert.strictEqual(result.slug, null);
        assert.strictEqual(result.source, 'empty');
        assert.strictEqual(result.found, false);
      }
    });

    it('should handle system tenant with env var', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      const originalEnv = process.env.SYSTEM_TENANT_ID;
      process.env.SYSTEM_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

      try {
        clearTenantResolveCache();
        const result = await resolveCanonicalTenant('system');
        
        assert.strictEqual(result.uuid, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
        assert.strictEqual(result.slug, 'system');
        assert.strictEqual(result.source, 'env');
        assert.strictEqual(result.found, true);
      } finally {
        if (originalEnv !== undefined) {
          process.env.SYSTEM_TENANT_ID = originalEnv;
        } else {
          delete process.env.SYSTEM_TENANT_ID;
        }
      }
    });

    it('should handle system tenant without env var', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      const originalEnv = process.env.SYSTEM_TENANT_ID;
      delete process.env.SYSTEM_TENANT_ID;

      try {
        clearTenantResolveCache();
        const result = await resolveCanonicalTenant('system');
        
        assert.strictEqual(result.uuid, null);
        assert.strictEqual(result.slug, 'system');
        assert.strictEqual(result.source, 'system-slug');
        assert.strictEqual(result.found, false);
      } finally {
        if (originalEnv !== undefined) {
          process.env.SYSTEM_TENANT_ID = originalEnv;
        }
      }
    });
  });

  describe('Cache Behavior', () => {
    it('should cache tenant resolution results', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      clearTenantResolveCache();
      
      // First call - cache miss
      await resolveCanonicalTenant('system');
      let stats = getTenantResolveCacheStats();
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.size, 1);

      // Second call - cache hit
      const result = await resolveCanonicalTenant('system');
      stats = getTenantResolveCacheStats();
      assert.strictEqual(stats.hits, 1);
      assert.strictEqual(stats.misses, 1);
      assert.strictEqual(stats.hitRatio, 0.5);
      assert.ok(result.source.includes('-cache'));
    });

    it('should report accurate cache statistics', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      clearTenantResolveCache();
      
      // Multiple calls with different identifiers
      await resolveCanonicalTenant('system');
      await resolveCanonicalTenant('test-tenant');
      await resolveCanonicalTenant('system'); // Cache hit
      
      const stats = getTenantResolveCacheStats();
      assert.strictEqual(stats.misses, 2, 'Should have 2 misses');
      assert.strictEqual(stats.hits, 1, 'Should have 1 hit');
      assert.strictEqual(stats.size, 2, 'Should have 2 cached entries');
      assert.ok(stats.ttlMs > 0, 'Should have TTL configured');
      assert.strictEqual(stats.hitRatio, 1/3, 'Hit ratio should be 33%');
    });

    it('should clear cache on demand', async () => {
      clearTenantResolveCache();
      
      await resolveCanonicalTenant('system');
      await resolveCanonicalTenant('test-tenant');
      
      let stats = getTenantResolveCacheStats();
      assert.strictEqual(stats.size, 2);
      
      clearTenantResolveCache();
      
      stats = getTenantResolveCacheStats();
      assert.strictEqual(stats.size, 0);
      assert.strictEqual(stats.hits, 0);
      assert.strictEqual(stats.misses, 0);
    });
  });

  describe('Integration Tests (Supabase)', () => {
    it('should resolve known UUID tenant from database', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      clearTenantResolveCache();
      const knownUuid = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
      
      const result = await resolveCanonicalTenant(knownUuid);
      
      // Should find in DB or return input if not found
      assert.strictEqual(result.uuid, knownUuid);
      assert.ok(['db-id', 'uuid-input', 'uuid-error'].includes(result.source));
    });

    it('should resolve known slug tenant from database', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      clearTenantResolveCache();
      const knownSlug = 'local-tenant-001';
      
      const result = await resolveCanonicalTenant(knownSlug);
      
      // Should attempt slug lookup
      assert.strictEqual(result.slug, knownSlug);
      assert.ok(['db-slug', 'slug-input', 'slug-error'].includes(result.source));
    });

    it('should handle unknown UUID gracefully', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      clearTenantResolveCache();
      const unknownUuid = '00000000-0000-0000-0000-000000000000';
      
      const result = await resolveCanonicalTenant(unknownUuid);
      
      assert.strictEqual(result.uuid, unknownUuid);
      assert.strictEqual(result.found, false);
      assert.ok(['uuid-input', 'uuid-error'].includes(result.source));
    });

    it('should handle unknown slug gracefully', async function() {
      if (!supabaseAvailable) {
        this.skip();
        return;
      }

      clearTenantResolveCache();
      const unknownSlug = 'nonexistent-tenant-xyz';
      
      const result = await resolveCanonicalTenant(unknownSlug);
      
      assert.strictEqual(result.slug, unknownSlug);
      assert.strictEqual(result.uuid, null);
      assert.strictEqual(result.found, false);
      assert.ok(['slug-input', 'slug-error'].includes(result.source));
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace in identifiers', async () => {
      const result = await resolveCanonicalTenant('  system  ');
      assert.strictEqual(result.slug, 'system');
    });

    it('should distinguish UUID from slug correctly', async () => {
      // UUID format
      const uuidResult = await resolveCanonicalTenant('a11dfb63-4b18-4eb8-872e-747af2e37c46');
      assert.ok(['db-id', 'uuid-input', 'uuid-error'].includes(uuidResult.source));
      
      // Slug format
      const slugResult = await resolveCanonicalTenant('my-tenant');
      assert.ok(['db-slug', 'slug-input', 'slug-error'].includes(slugResult.source));
    });

    it('should handle case sensitivity in UUIDs', async () => {
      const lowerUuid = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
      const upperUuid = 'A11DFB63-4B18-4EB8-872E-747AF2E37C46';
      
      assert.strictEqual(isUuid(lowerUuid), true);
      assert.strictEqual(isUuid(upperUuid), true);
    });
  });
});
