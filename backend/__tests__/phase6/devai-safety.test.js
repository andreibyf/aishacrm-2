/**
 * Phase 6: Developer AI Safety Tests
 * Tests for command safety classification, approval workflow, and export bundles
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyCommand, classifyFileOperation } from '../../lib/commandSafety.js';
import { redactSecrets, redactSecretsFromObject, isPathSafe, isFileExportable } from '../../lib/devaiSecurity.js';

describe('Phase 6: Command Safety Classification', () => {
  
  describe('Safe Commands (Auto-Execute)', () => {
    it('should allow docker ps', () => {
      const result = classifyCommand('docker ps');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
    
    it('should allow docker logs with tail', () => {
      const result = classifyCommand('docker logs --tail 50 aishacrm-backend');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
    
    it('should allow systemctl status', () => {
      const result = classifyCommand('systemctl status nginx');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
    
    it('should allow health check curl', () => {
      const result = classifyCommand('curl -I http://localhost:4001/health');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
    
    it('should allow safe file reads', () => {
      const result = classifyCommand('cat package.json');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
    
    it('should allow git status', () => {
      const result = classifyCommand('git status');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
  });
  
  describe('Blocked Commands', () => {
    it('should block rm -rf', () => {
      const result = classifyCommand('rm -rf /app/node_modules');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should block sudo commands', () => {
      const result = classifyCommand('sudo apt-get install vim');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should block ssh', () => {
      const result = classifyCommand('ssh user@host');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should block env variable access', () => {
      const result = classifyCommand('printenv');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should block reading .env files', () => {
      const result = classifyCommand('cat .env');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
  });
  
  describe('Approval-Required Commands', () => {
    it('should require approval for chmod', () => {
      const result = classifyCommand('chmod 777 script.sh');
      assert.strictEqual(result.level, 'requires_approval');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should require approval for npm install', () => {
      const result = classifyCommand('npm install lodash');
      assert.strictEqual(result.level, 'requires_approval');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should require approval for unknown commands', () => {
      const result = classifyCommand('some-custom-script.sh');
      assert.strictEqual(result.level, 'requires_approval');
      assert.strictEqual(result.autoExecute, false);
    });
  });
  
  describe('File Operations', () => {
    it('should allow read operations on safe files', () => {
      const result = classifyFileOperation('read', 'backend/routes/accounts.js');
      assert.strictEqual(result.level, 'allowed');
      assert.strictEqual(result.autoExecute, true);
    });
    
    it('should block reading .env files', () => {
      const result = classifyFileOperation('read', '.env');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should require approval for write operations', () => {
      const result = classifyFileOperation('write', 'backend/routes/test.js');
      assert.strictEqual(result.level, 'requires_approval');
      assert.strictEqual(result.autoExecute, false);
    });
    
    it('should block delete operations', () => {
      const result = classifyFileOperation('delete', 'backend/routes/test.js');
      assert.strictEqual(result.level, 'blocked');
      assert.strictEqual(result.autoExecute, false);
    });
  });
});

describe('Phase 6: Secret Redaction', () => {
  
  it('should redact JWT tokens', () => {
    const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const redacted = redactSecrets(text);
    assert.ok(redacted.includes('[REDACTED_JWT]'));
    assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  });
  
  it('should redact Bearer tokens', () => {
    const text = 'Authorization: Bearer sk_test_abcdef123456';
    const redacted = redactSecrets(text);
    assert.ok(redacted.includes('[REDACTED_TOKEN]'));
    assert.ok(!redacted.includes('sk_test_abcdef123456'));
  });
  
  it('should redact API keys', () => {
    const text = 'OPENAI_API_KEY=sk-proj-1234567890abcdef';
    const redacted = redactSecrets(text);
    assert.ok(redacted.includes('[REDACTED]'));
    assert.ok(!redacted.includes('sk-proj-1234567890abcdef'));
  });
  
  it('should redact Supabase keys', () => {
    const text = 'Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' + 'a'.repeat(100);
    const redacted = redactSecrets(text);
    assert.ok(redacted.includes('[REDACTED_SUPABASE_KEY]'));
  });
  
  it('should redact secrets from objects', () => {
    const obj = {
      username: 'admin',
      password: 'secret123',
      api_key: 'sk_test_123',
      safe_data: 'public info'
    };
    const redacted = redactSecretsFromObject(obj);
    assert.strictEqual(redacted.password, '[REDACTED]');
    assert.strictEqual(redacted.api_key, '[REDACTED]');
    assert.strictEqual(redacted.safe_data, 'public info');
    assert.strictEqual(redacted.username, 'admin');
  });
  
  it('should handle nested objects', () => {
    const obj = {
      config: {
        database: {
          password: 'dbpass123'
        },
        api: {
          key: 'sk_123'
        }
      }
    };
    const redacted = redactSecretsFromObject(obj);
    assert.strictEqual(redacted.config.database.password, '[REDACTED]');
    assert.strictEqual(redacted.config.api.key, '[REDACTED]');
  });
});

describe('Phase 6: Path Safety Validation', () => {
  
  it('should allow safe paths', () => {
    assert.ok(isPathSafe('/app/backend/routes/test.js'));
    assert.ok(isPathSafe('/app/src/components/Test.jsx'));
  });
  
  it('should block path traversal', () => {
    assert.ok(!isPathSafe('/app/../../../etc/passwd'));
    assert.ok(!isPathSafe('backend/../../.env'));
  });
  
  it('should block .env files', () => {
    assert.ok(!isPathSafe('/app/.env'));
    assert.ok(!isPathSafe('/app/backend/.env.local'));
  });
  
  it('should block key files', () => {
    assert.ok(!isPathSafe('/app/id_rsa'));
    assert.ok(!isPathSafe('/app/secrets/private.key'));
  });
  
  it('should block secrets directories', () => {
    assert.ok(!isPathSafe('/app/secrets/config.json'));
    assert.ok(!isPathSafe('/app/credentials/token'));
  });
  
  describe('Export Safety', () => {
    it('should allow exportable source files', () => {
      assert.ok(isFileExportable('/app/backend/routes/test.js'));
      assert.ok(isFileExportable('/app/src/components/Test.jsx'));
    });
    
    it('should block node_modules', () => {
      assert.ok(!isFileExportable('/app/node_modules/package/index.js'));
    });
    
    it('should block build artifacts', () => {
      assert.ok(!isFileExportable('/app/dist/bundle.js'));
      assert.ok(!isFileExportable('/app/build/output.js'));
    });
    
    it('should block log files', () => {
      assert.ok(!isFileExportable('/app/backend/server.log'));
      assert.ok(!isFileExportable('/app/error.log'));
    });
  });
});

describe('Phase 6: Integration Tests', () => {
  // Note: These tests require a running Supabase instance and are more like E2E tests
  // They should be run in a test environment with proper database setup
  
  it.skip('should create approval record in database', async () => {
    // TODO: Implement when test database is available
    // This would test the createApproval function end-to-end
  });
  
  it.skip('should execute approved action', async () => {
    // TODO: Test the full approval -> execute workflow
  });
  
  it.skip('should create export bundle with manifest', async () => {
    // TODO: Test export bundle creation
  });
});

console.log('✅ Phase 6: Developer AI Safety Tests');
