import { describe, it } from 'node:test';
import assert from 'node:assert';
import expandUserMetadata from '../../lib/expandUserMetadata.js';

describe('expandUserMetadata', () => {
  it('returns null/undefined input unchanged', () => {
    assert.strictEqual(expandUserMetadata(null), null);
    assert.strictEqual(expandUserMetadata(undefined), undefined);
  });

  it('computes display_name from first_name + last_name', () => {
    const result = expandUserMetadata({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      metadata: {},
    });
    assert.strictEqual(result.display_name, 'Jane Doe');
    assert.strictEqual(result.full_name, 'Jane Doe');
  });

  it('computes display_name from first_name only when last_name is missing', () => {
    const result = expandUserMetadata({
      first_name: 'Jane',
      email: 'jane@example.com',
      metadata: {},
    });
    assert.strictEqual(result.display_name, 'Jane');
    assert.strictEqual(result.full_name, 'Jane');
  });

  it('falls back to email when both names are missing', () => {
    const result = expandUserMetadata({
      email: 'jane@example.com',
      metadata: {},
    });
    assert.strictEqual(result.display_name, 'jane@example.com');
    assert.strictEqual(result.full_name, 'jane@example.com');
  });

  it('prefers metadata.display_name over computed name', () => {
    const result = expandUserMetadata({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      metadata: { display_name: 'Dr. Jane' },
    });
    assert.strictEqual(result.display_name, 'Dr. Jane');
    // full_name is always computed from first+last
    assert.strictEqual(result.full_name, 'Jane Doe');
  });

  it('promotes whitelisted metadata keys to top-level', () => {
    const result = expandUserMetadata({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      metadata: {
        live_status: 'online',
        is_active: true,
        tags: ['vip'],
      },
    });
    assert.strictEqual(result.live_status, 'online');
    assert.strictEqual(result.is_active, true);
    assert.deepStrictEqual(result.tags, ['vip']);
  });

  it('removes promoted keys from nested metadata', () => {
    const result = expandUserMetadata({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      metadata: {
        display_name: 'Dr. Jane',
        live_status: 'online',
        custom_field: 'kept',
      },
    });
    // Promoted keys should NOT be in nested metadata
    assert.strictEqual(result.metadata.display_name, undefined);
    assert.strictEqual(result.metadata.live_status, undefined);
    // Non-promoted keys should remain
    assert.strictEqual(result.metadata.custom_field, 'kept');
  });

  it('handles empty metadata gracefully', () => {
    const result = expandUserMetadata({
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
    });
    assert.strictEqual(result.display_name, 'Jane Doe');
    assert.strictEqual(result.full_name, 'Jane Doe');
    assert.deepStrictEqual(result.metadata, {});
  });

  it('handles user with no metadata, no names, no email', () => {
    const result = expandUserMetadata({ id: '123' });
    assert.strictEqual(result.display_name, undefined);
    assert.strictEqual(result.full_name, null);
  });

  it('preserves all original user fields', () => {
    const result = expandUserMetadata({
      id: 'uuid-123',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      role: 'admin',
      tenant_id: 'tenant-456',
      metadata: {},
    });
    assert.strictEqual(result.id, 'uuid-123');
    assert.strictEqual(result.role, 'admin');
    assert.strictEqual(result.tenant_id, 'tenant-456');
    assert.strictEqual(result.email, 'jane@example.com');
  });
});
