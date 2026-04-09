import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('team visibility archive guards', () => {
  it('bizdev archive enforces full-access record checks', () => {
    const bizdevRoutePath = path.resolve(process.cwd(), 'backend/routes/bizdevsources.js');
    const source = fs.readFileSync(bizdevRoutePath, 'utf8');

    assert.match(
      source,
      /router\.post\('\/archive'[\s\S]*getVisibilityScope\(req\.user, supabase\)/,
      'archive should resolve visibility scope for authenticated users',
    );

    assert.match(
      source,
      /router\.post\('\/archive'[\s\S]*getAccessLevel\(/,
      'archive should evaluate per-record access levels',
    );

    assert.match(
      source,
      /router\.post\('\/archive'[\s\S]*access !== 'full'/,
      'archive should reject records without full write access',
    );
  });
});
