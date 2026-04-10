import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('team visibility promote guards', () => {
  it('bizdev promote enforces full-access record checks', () => {
    const pathCandidates = [
      path.resolve(process.cwd(), 'backend/routes/bizdevsources.js'),
      path.resolve(process.cwd(), 'routes/bizdevsources.js'),
    ];
    const bizdevRoutePath = pathCandidates.find((p) => fs.existsSync(p));
    assert.ok(bizdevRoutePath, 'bizdevsources.js should exist in expected path candidates');
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
      /router\.post\([\s\S]*'\/:id\/promote'[\s\S]*FOR UPDATE[\s\S]*getAccessLevel\([\s\S]*bizdevSource\.assigned_to_team[\s\S]*bizdevSource\.assigned_to/,
      'promote should evaluate access from locked row assignment state',
    );

    assert.match(
      source,
      /router\.post\([\s\S]*'\/:id\/promote'[\s\S]*access !== 'full'/,
      'promote should reject records without full write access',
    );
  });
});
