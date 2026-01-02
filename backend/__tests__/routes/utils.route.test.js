/**
 * Tests for utils routes - Utility endpoints
 * Critical for unique ID generation and system utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

describe('Utils Routes - Unique ID Generation Logic', () => {
  // Test the core unique ID generation logic
  function generateUniqueId(entityType) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars

    let prefix = 'UNKN';
    if (entityType === 'Lead' || entityType === 'lead') {
      prefix = 'L';
    } else if (entityType === 'Contact' || entityType === 'contact') {
      prefix = 'C';
    } else if (entityType === 'Account' || entityType === 'account') {
      prefix = 'ACC';
    } else if (entityType === 'Opportunity' || entityType === 'opportunity') {
      prefix = 'OPP';
    }

    return `${prefix}-${dateStr}-${randomStr}`;
  }

  describe('Unique ID Generation', () => {
    it('should generate ID with correct format for Lead', () => {
      const id = generateUniqueId('Lead');
      const pattern = /^L-\d{8}-[0-9A-F]{6}$/;
      assert.ok(pattern.test(id), `Generated ID "${id}" should match pattern L-YYYYMMDD-XXXXXX`);
    });

    it('should generate ID with correct format for Contact', () => {
      const id = generateUniqueId('Contact');
      const pattern = /^C-\d{8}-[0-9A-F]{6}$/;
      assert.ok(pattern.test(id));
    });

    it('should generate ID with correct format for Account', () => {
      const id = generateUniqueId('Account');
      const pattern = /^ACC-\d{8}-[0-9A-F]{6}$/;
      assert.ok(pattern.test(id));
    });

    it('should generate ID with correct format for Opportunity', () => {
      const id = generateUniqueId('Opportunity');
      const pattern = /^OPP-\d{8}-[0-9A-F]{6}$/;
      assert.ok(pattern.test(id));
    });

    it('should handle case-insensitive entity types', () => {
      const idLower = generateUniqueId('lead');
      const idUpper = generateUniqueId('Lead');
      
      assert.ok(idLower.startsWith('L-'));
      assert.ok(idUpper.startsWith('L-'));
    });

    it('should use UNKN prefix for unknown entity types', () => {
      const id = generateUniqueId('UnknownType');
      assert.ok(id.startsWith('UNKN-'));
    });

    it('should generate different IDs on consecutive calls', () => {
      const id1 = generateUniqueId('Lead');
      const id2 = generateUniqueId('Lead');
      
      assert.notStrictEqual(id1, id2, 'Consecutive calls should generate different IDs');
    });

    it('should include current date in YYYYMMDD format', () => {
      const id = generateUniqueId('Lead');
      const parts = id.split('-');
      
      assert.strictEqual(parts.length, 3);
      
      const datePart = parts[1];
      assert.strictEqual(datePart.length, 8);
      
      // Verify it's a valid date format
      const year = parseInt(datePart.substring(0, 4));
      const month = parseInt(datePart.substring(4, 6));
      const day = parseInt(datePart.substring(6, 8));
      
      assert.ok(year >= 2020 && year <= 2100);
      assert.ok(month >= 1 && month <= 12);
      assert.ok(day >= 1 && day <= 31);
    });

    it('should generate 6-character hex random suffix', () => {
      const id = generateUniqueId('Lead');
      const parts = id.split('-');
      const randomPart = parts[2];
      
      assert.strictEqual(randomPart.length, 6);
      assert.ok(/^[0-9A-F]{6}$/.test(randomPart));
    });

    it('should generate unique IDs for all supported entity types', () => {
      const entityTypes = ['Lead', 'Contact', 'Account', 'Opportunity'];
      const expectedPrefixes = ['L', 'C', 'ACC', 'OPP'];
      
      entityTypes.forEach((type, index) => {
        const id = generateUniqueId(type);
        assert.ok(id.startsWith(expectedPrefixes[index] + '-'));
      });
    });
  });

  describe('UUID Generation', () => {
    it('should generate valid UUID v4', () => {
      const uuid = crypto.randomUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(uuid));
    });

    it('should generate different UUIDs on consecutive calls', () => {
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      assert.notStrictEqual(uuid1, uuid2);
    });
  });
});
