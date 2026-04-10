import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('team visibility bulk delete guards', () => {
  it('leads bulk-delete enforces full-access record checks', () => {
    const leadsRoutePath = path.resolve(process.cwd(), 'backend/routes/leads.v2.js');
    const source = fs.readFileSync(leadsRoutePath, 'utf8');

    assert.match(
      source,
      /router\.post\('\/bulk-delete'[\s\S]*getVisibilityScope\(req\.user, supabase\)/,
      'bulk-delete should resolve visibility scope for authenticated users',
    );

    assert.match(
      source,
      /router\.post\('\/bulk-delete'[\s\S]*getAccessLevel\(/,
      'bulk-delete should evaluate per-record access levels',
    );

    assert.match(
      source,
      /router\.post\('\/bulk-delete'[\s\S]*access !== 'full'/,
      'bulk-delete should reject records without full write access',
    );
  });
});
