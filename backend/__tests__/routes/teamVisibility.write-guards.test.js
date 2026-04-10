import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_FILES = [
  'backend/routes/leads.v2.js',
  'backend/routes/contacts.v2.js',
  'backend/routes/accounts.v2.js',
  'backend/routes/opportunities.v2.js',
  'backend/routes/activities.v2.js',
  'backend/routes/bizdevsources.js',
];

describe('team visibility write guards parity', () => {
  it('enforces read_only write blocks across all team-scoped update routes', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

    for (const relativePath of ROUTE_FILES) {
      const absolutePath = path.resolve(repoRoot, relativePath);
      const source = fs.readFileSync(absolutePath, 'utf8');

      assert.match(
        source,
        /access\s*===\s*["']read_only["']/,
        `${relativePath} should explicitly block updates for read_only access`,
      );
      assert.match(
        source,
        /This record is read-only for your access level/,
        `${relativePath} should return a consistent read_only denial message`,
      );
    }
  });
});
