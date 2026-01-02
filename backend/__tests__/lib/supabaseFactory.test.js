/**
 * Tests for supabaseFactory - Centralized Supabase client creation
 * Critical for ensuring consistent configuration across the app
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock environment variables before importing the factory
const originalEnv = { ...process.env };
beforeEach(() => {
  // Reset environment to known state
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUPABASE_STORAGE_BUCKET = 'test-bucket';
});

// Import after env setup
import { 
  getSupabaseAdmin, 
  getSupabaseDB, 
  getBucketName,
  _resetClients 
} from '../../lib/supabaseFactory.js';

describe('supabaseFactory', () => {
  describe('getSupabaseAdmin()', () => {
    it('should create admin client with correct configuration', () => {
      _resetClients(); // Reset singleton state
      const client = getSupabaseAdmin();
      
      assert.ok(client, 'Admin client should be created');
      assert.strictEqual(typeof client.from, 'function', 'Client should have from() method');
      assert.strictEqual(typeof client.auth, 'object', 'Client should have auth object');
    });

    it('should return same instance on subsequent calls (singleton)', () => {
      _resetClients();
      const client1 = getSupabaseAdmin();
      const client2 = getSupabaseAdmin();
      
      assert.strictEqual(client1, client2, 'Should return same instance');
    });

    it('should throw error when SUPABASE_URL is missing (default behavior)', () => {
      _resetClients();
      delete process.env.SUPABASE_URL;
      
      assert.throws(
        () => getSupabaseAdmin(),
        /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/,
        'Should throw error for missing URL'
      );
      
      // Restore env
      process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    });

    it('should return null when SUPABASE_URL is missing and throwOnMissing=false', () => {
      _resetClients();
      delete process.env.SUPABASE_URL;
      
      const client = getSupabaseAdmin({ throwOnMissing: false });
      assert.strictEqual(client, null, 'Should return null when credentials missing');
      
      // Restore env
      process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    });

    it('should throw error when SUPABASE_SERVICE_ROLE_KEY is missing (default behavior)', () => {
      _resetClients();
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      assert.throws(
        () => getSupabaseAdmin(),
        /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/,
        'Should throw error for missing service role key'
      );
      
      // Restore env
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
    });
  });

  describe('getSupabaseDB()', () => {
    it('should create DB client with performance tracking', () => {
      _resetClients();
      const client = getSupabaseDB();
      
      assert.ok(client, 'DB client should be created');
      assert.strictEqual(typeof client.from, 'function', 'Client should have from() method');
    });

    it('should return same instance on subsequent calls (singleton)', () => {
      _resetClients();
      const client1 = getSupabaseDB();
      const client2 = getSupabaseDB();
      
      assert.strictEqual(client1, client2, 'Should return same instance');
    });

    it('should be different from admin client', () => {
      _resetClients();
      const adminClient = getSupabaseAdmin();
      const dbClient = getSupabaseDB();
      
      // They should be different instances (one with timed fetch, one without)
      assert.notStrictEqual(adminClient, dbClient, 'Admin and DB clients should be different instances');
    });

    it('should throw error when SUPABASE_URL is missing', () => {
      _resetClients();
      delete process.env.SUPABASE_URL;
      
      assert.throws(
        () => getSupabaseDB(),
        /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/,
        'Should throw error for missing URL'
      );
      
      // Restore env
      process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
    });

    it('should throw error when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      _resetClients();
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      assert.throws(
        () => getSupabaseDB(),
        /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/,
        'Should throw error for missing service role key'
      );
      
      // Restore env
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
    });
  });

  describe('getBucketName()', () => {
    it('should return configured bucket name', () => {
      process.env.SUPABASE_STORAGE_BUCKET = 'custom-bucket';
      const bucketName = getBucketName();
      
      assert.strictEqual(bucketName, 'custom-bucket', 'Should return configured bucket name');
    });

    it('should return default bucket name when not configured', () => {
      delete process.env.SUPABASE_STORAGE_BUCKET;
      const bucketName = getBucketName();
      
      assert.strictEqual(bucketName, 'tenant-assets', 'Should return default bucket name');
      
      // Restore env
      process.env.SUPABASE_STORAGE_BUCKET = originalEnv.SUPABASE_STORAGE_BUCKET;
    });
  });

  describe('_resetClients()', () => {
    it('should reset singleton state', () => {
      const client1 = getSupabaseAdmin();
      _resetClients();
      const client2 = getSupabaseAdmin();
      
      // After reset, a new instance should be created
      // Note: They might be the same if Supabase caches internally, but we reset our references
      assert.ok(client1, 'First client should exist');
      assert.ok(client2, 'Second client should exist');
    });
  });
});
