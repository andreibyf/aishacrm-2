import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('team visibility promote guards', () => {
  it('bizdev promote enforces full-access record checks', () => {
    const bizdevRoutePath = path.resolve(process.cwd(), 'backend/routes/bizdevsources.js');
    const source = fs.readFileSync(bizdevRoutePath, 'utf8');

    assert.match(
      source,
      /router\.post\([\s\S]*'\/:id\/promote'[\s\S]*getVisibilityScope\(req\.user, supabase\)/,
      'promote should resolve visibility scope for authenticated users',
    );

    assert.match(
      source,
      /router\.post\([\s\S]*'\/:id\/promote'[\s\S]*getAccessLevel\(/,
      'promote should evaluate per-record access levels',
    );

    assert.match(
      source,
      /router\.post\([\s\S]*'\/:id\/promote'[\s\S]*access !== 'full'/,
      'promote should reject records without full write access',
    );
  });
});
