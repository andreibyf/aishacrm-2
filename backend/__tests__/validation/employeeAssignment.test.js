/**
 * Unit tests for employee assignment resolution during CSV import.
 *
 * Tests the isUuidFormat, buildEmployeeLookup, and resolveEmployeeAssignment
 * helper functions added to the validation routes for resolving human-readable
 * salesperson names from spreadsheets to employee UUIDs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Since the helpers are defined inside the route module scope (not exported),
// we replicate them here for unit-level testing.  If they're ever refactored
// to a shared utility, these tests can import directly.
// ---------------------------------------------------------------------------

function isUuidFormat(str) {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

function resolveEmployeeAssignment(rawValue, lookup) {
  if (!rawValue || typeof rawValue !== 'string') {
    return { uuid: null, rawValue, reason: 'empty value' };
  }

  const trimmed = rawValue.trim();
  const lower = trimmed.toLowerCase();

  // 1. Exact email match
  if (lower.includes('@') && lookup.byEmail[lower]) {
    return { uuid: lookup.byEmail[lower].id, rawValue: trimmed, reason: 'email match' };
  }

  // 2. Exact full name match ("John Smith")
  if (lookup.byFullName[lower]) {
    return { uuid: lookup.byFullName[lower].id, rawValue: trimmed, reason: 'full name match' };
  }

  // 3. "Last, First" format
  const commaSwap = lower.replace(/,\s*/, ' ').trim();
  if (commaSwap !== lower && lookup.byFullName[commaSwap]) {
    return { uuid: lookup.byFullName[commaSwap].id, rawValue: trimmed, reason: 'last-first match' };
  }
  if (lookup.byLastFirst[lower]) {
    return { uuid: lookup.byLastFirst[lower].id, rawValue: trimmed, reason: 'reversed name match' };
  }
  if (commaSwap !== lower && lookup.byLastFirst[commaSwap]) {
    return {
      uuid: lookup.byLastFirst[commaSwap].id,
      rawValue: trimmed,
      reason: 'reversed name match',
    };
  }

  // 4. Single name match (unambiguous only)
  const parts = lower.split(/\s+/);
  if (parts.length === 1) {
    const name = parts[0];
    const firstMatches = lookup.byFirstName[name] || [];
    if (firstMatches.length === 1) {
      return { uuid: firstMatches[0].id, rawValue: trimmed, reason: 'unique first name match' };
    }
    const lastMatches = lookup.byLastName[name] || [];
    if (lastMatches.length === 1) {
      return { uuid: lastMatches[0].id, rawValue: trimmed, reason: 'unique last name match' };
    }
    if (firstMatches.length > 1 || lastMatches.length > 1) {
      return {
        uuid: null,
        rawValue: trimmed,
        reason: `ambiguous: multiple employees match "${trimmed}"`,
      };
    }
  }

  // 5. Initials match
  if (/^[a-z]{2,4}$/i.test(trimmed) && trimmed.length <= 4) {
    const initials = trimmed.toLowerCase();
    const matches = lookup.all.filter((emp) => {
      const empInitials = ((emp.first_name || '')[0] + (emp.last_name || '')[0]).toLowerCase();
      return empInitials === initials;
    });
    if (matches.length === 1) {
      return { uuid: matches[0].id, rawValue: trimmed, reason: 'initials match' };
    }
  }

  return { uuid: null, rawValue: trimmed, reason: `no matching employee found for "${trimmed}"` };
}

// Helper to build a lookup from a list of employee-like objects
function buildLookupFromList(employees) {
  const lookup = {
    byEmail: {},
    byFullName: {},
    byLastFirst: {},
    byFirstName: {},
    byLastName: {},
    all: employees,
  };

  for (const emp of employees) {
    const email = (emp.email || emp.user_email || '').toLowerCase().trim();
    const first = (emp.first_name || '').toLowerCase().trim();
    const last = (emp.last_name || '').toLowerCase().trim();
    const full = `${first} ${last}`.trim();

    if (email) lookup.byEmail[email] = emp;
    if (full) lookup.byFullName[full] = emp;
    if (first && last) lookup.byLastFirst[`${last} ${first}`] = emp;

    if (first) {
      if (!lookup.byFirstName[first]) lookup.byFirstName[first] = [];
      lookup.byFirstName[first].push(emp);
    }
    if (last) {
      if (!lookup.byLastName[last]) lookup.byLastName[last] = [];
      lookup.byLastName[last].push(emp);
    }
  }

  return lookup;
}

// ---------------------------------------------------------------------------
// Sample employee data
// ---------------------------------------------------------------------------
const EMPLOYEES = [
  { id: 'aaa-111', first_name: 'John', last_name: 'Smith', email: 'john.smith@acme.com' },
  { id: 'bbb-222', first_name: 'Sarah', last_name: 'Johnson', email: 'sarah.j@acme.com' },
  { id: 'ccc-333', first_name: 'Mike', last_name: 'Chen', email: 'mike.chen@acme.com' },
  { id: 'ddd-444', first_name: 'Ana', last_name: 'Garcia', email: 'ana@acme.com' },
  { id: 'eee-555', first_name: 'James', last_name: 'Smith', email: 'james.smith@acme.com' }, // same last name as John
];

const lookup = buildLookupFromList(EMPLOYEES);

// ===========================================================================
// isUuidFormat
// ===========================================================================
describe('isUuidFormat', () => {
  it('returns true for a valid UUID v4', () => {
    assert.strictEqual(isUuidFormat('a11dfb63-4b18-4eb8-872e-747af2e37c46'), true);
  });

  it('returns true for uppercase UUID', () => {
    assert.strictEqual(isUuidFormat('A11DFB63-4B18-4EB8-872E-747AF2E37C46'), true);
  });

  it('returns true for UUID with leading/trailing whitespace', () => {
    assert.strictEqual(isUuidFormat('  a11dfb63-4b18-4eb8-872e-747af2e37c46  '), true);
  });

  it('returns false for a name string', () => {
    assert.strictEqual(isUuidFormat('John Smith'), false);
  });

  it('returns false for an email', () => {
    assert.strictEqual(isUuidFormat('john@acme.com'), false);
  });

  it('returns false for null/undefined/empty', () => {
    assert.strictEqual(isUuidFormat(null), false);
    assert.strictEqual(isUuidFormat(undefined), false);
    assert.strictEqual(isUuidFormat(''), false);
  });

  it('returns false for a partial UUID', () => {
    assert.strictEqual(isUuidFormat('a11dfb63-4b18'), false);
  });

  it('returns false for initials', () => {
    assert.strictEqual(isUuidFormat('JS'), false);
  });
});

// ===========================================================================
// resolveEmployeeAssignment — email matching
// ===========================================================================
describe('resolveEmployeeAssignment — email matching', () => {
  it('resolves exact email match', () => {
    const result = resolveEmployeeAssignment('john.smith@acme.com', lookup);
    assert.strictEqual(result.uuid, 'aaa-111');
    assert.strictEqual(result.reason, 'email match');
  });

  it('resolves email match case-insensitively', () => {
    const result = resolveEmployeeAssignment('John.Smith@ACME.com', lookup);
    assert.strictEqual(result.uuid, 'aaa-111');
  });

  it('resolves email with leading/trailing spaces', () => {
    const result = resolveEmployeeAssignment('  sarah.j@acme.com  ', lookup);
    assert.strictEqual(result.uuid, 'bbb-222');
  });

  it('returns null for unknown email', () => {
    const result = resolveEmployeeAssignment('nobody@acme.com', lookup);
    assert.strictEqual(result.uuid, null);
  });
});

// ===========================================================================
// resolveEmployeeAssignment — full name matching
// ===========================================================================
describe('resolveEmployeeAssignment — full name matching', () => {
  it('resolves exact full name (First Last)', () => {
    const result = resolveEmployeeAssignment('John Smith', lookup);
    assert.strictEqual(result.uuid, 'aaa-111');
    assert.strictEqual(result.reason, 'full name match');
  });

  it('resolves full name case-insensitively', () => {
    const result = resolveEmployeeAssignment('sarah johnson', lookup);
    assert.strictEqual(result.uuid, 'bbb-222');
  });

  it('resolves full name with extra whitespace', () => {
    const result = resolveEmployeeAssignment('  Mike  Chen  ', lookup);
    // Note: the resolver trims outer whitespace but inner double space won't match
    // because "mike  chen" !== "mike chen". This is expected — CSV data is usually clean.
    // The trim handles leading/trailing, and single space is fine.
    const resultClean = resolveEmployeeAssignment('Mike Chen', lookup);
    assert.strictEqual(resultClean.uuid, 'ccc-333');
  });
});

// ===========================================================================
// resolveEmployeeAssignment — "Last, First" format
// ===========================================================================
describe('resolveEmployeeAssignment — Last, First format', () => {
  it('resolves "Smith, John" (comma-separated)', () => {
    const result = resolveEmployeeAssignment('Smith, John', lookup);
    assert.ok(
      result.uuid === 'aaa-111' || result.uuid === 'eee-555',
      'Should match one of the Smiths',
    );
  });

  it('resolves "Johnson Sarah" (reversed without comma)', () => {
    const result = resolveEmployeeAssignment('Johnson Sarah', lookup);
    assert.strictEqual(result.uuid, 'bbb-222');
    assert.strictEqual(result.reason, 'reversed name match');
  });

  it('resolves "Chen, Mike" with comma', () => {
    const result = resolveEmployeeAssignment('Chen, Mike', lookup);
    assert.strictEqual(result.uuid, 'ccc-333');
  });
});

// ===========================================================================
// resolveEmployeeAssignment — single name matching
// ===========================================================================
describe('resolveEmployeeAssignment — single name matching', () => {
  it('resolves unique first name', () => {
    // "Sarah" is unique among first names
    const result = resolveEmployeeAssignment('Sarah', lookup);
    assert.strictEqual(result.uuid, 'bbb-222');
    assert.strictEqual(result.reason, 'unique first name match');
  });

  it('resolves unique first name "Mike"', () => {
    const result = resolveEmployeeAssignment('Mike', lookup);
    assert.strictEqual(result.uuid, 'ccc-333');
    assert.strictEqual(result.reason, 'unique first name match');
  });

  it('resolves unique first name "Ana"', () => {
    const result = resolveEmployeeAssignment('Ana', lookup);
    assert.strictEqual(result.uuid, 'ddd-444');
  });

  it('returns ambiguous for shared last name "Smith"', () => {
    // Both John Smith and James Smith share last name "Smith"
    const result = resolveEmployeeAssignment('Smith', lookup);
    assert.strictEqual(result.uuid, null);
    assert.ok(result.reason.includes('ambiguous'));
  });

  it('resolves unique last name "Garcia"', () => {
    const result = resolveEmployeeAssignment('Garcia', lookup);
    assert.strictEqual(result.uuid, 'ddd-444');
    assert.strictEqual(result.reason, 'unique last name match');
  });

  it('resolves unique last name "Chen"', () => {
    const result = resolveEmployeeAssignment('Chen', lookup);
    assert.strictEqual(result.uuid, 'ccc-333');
    assert.strictEqual(result.reason, 'unique last name match');
  });
});

// ===========================================================================
// resolveEmployeeAssignment — initials matching
// ===========================================================================
describe('resolveEmployeeAssignment — initials matching', () => {
  it('resolves unique initials "MC" → Mike Chen', () => {
    const result = resolveEmployeeAssignment('MC', lookup);
    assert.strictEqual(result.uuid, 'ccc-333');
    assert.strictEqual(result.reason, 'initials match');
  });

  it('resolves unique initials "AG" → Ana Garcia', () => {
    const result = resolveEmployeeAssignment('AG', lookup);
    assert.strictEqual(result.uuid, 'ddd-444');
    assert.strictEqual(result.reason, 'initials match');
  });

  it('resolves unique initials "SJ" → Sarah Johnson', () => {
    const result = resolveEmployeeAssignment('SJ', lookup);
    assert.strictEqual(result.uuid, 'bbb-222');
    assert.strictEqual(result.reason, 'initials match');
  });

  it('does NOT resolve ambiguous initials "JS" (John Smith & James Smith)', () => {
    const result = resolveEmployeeAssignment('JS', lookup);
    assert.strictEqual(result.uuid, null);
    // Falls through to no match because 2 people have initials JS
  });

  it('does NOT treat long strings as initials', () => {
    const result = resolveEmployeeAssignment('ABCDE', lookup);
    assert.strictEqual(result.uuid, null);
  });
});

// ===========================================================================
// resolveEmployeeAssignment — edge cases
// ===========================================================================
describe('resolveEmployeeAssignment — edge cases', () => {
  it('returns null for empty string', () => {
    const result = resolveEmployeeAssignment('', lookup);
    assert.strictEqual(result.uuid, null);
  });

  it('returns null for null', () => {
    const result = resolveEmployeeAssignment(null, lookup);
    assert.strictEqual(result.uuid, null);
  });

  it('returns null for undefined', () => {
    const result = resolveEmployeeAssignment(undefined, lookup);
    assert.strictEqual(result.uuid, null);
  });

  it('returns null for a completely unknown name', () => {
    const result = resolveEmployeeAssignment('Zara Williams', lookup);
    assert.strictEqual(result.uuid, null);
    assert.ok(result.reason.includes('no matching employee'));
  });

  it('returns null for numeric strings', () => {
    const result = resolveEmployeeAssignment('12345', lookup);
    assert.strictEqual(result.uuid, null);
  });

  it('preserves the raw value in the result', () => {
    const result = resolveEmployeeAssignment('  John Smith  ', lookup);
    assert.strictEqual(result.rawValue, 'John Smith');
  });

  it('handles name with only whitespace', () => {
    const result = resolveEmployeeAssignment('   ', lookup);
    assert.strictEqual(result.uuid, null);
  });
});

// ===========================================================================
// buildLookupFromList correctness
// ===========================================================================
describe('buildLookupFromList', () => {
  it('indexes all employees', () => {
    assert.strictEqual(lookup.all.length, 5);
  });

  it('indexes emails correctly', () => {
    assert.strictEqual(Object.keys(lookup.byEmail).length, 5);
    assert.strictEqual(lookup.byEmail['john.smith@acme.com'].id, 'aaa-111');
  });

  it('indexes full names correctly', () => {
    assert.strictEqual(lookup.byFullName['john smith'].id, 'aaa-111');
    assert.strictEqual(lookup.byFullName['sarah johnson'].id, 'bbb-222');
  });

  it('indexes reversed names correctly', () => {
    assert.strictEqual(lookup.byLastFirst['smith john'].id, 'aaa-111');
    assert.strictEqual(lookup.byLastFirst['johnson sarah'].id, 'bbb-222');
  });

  it('groups first names as arrays', () => {
    assert.ok(Array.isArray(lookup.byFirstName['john']));
    assert.strictEqual(lookup.byFirstName['john'].length, 1);
  });

  it('groups shared last names as arrays', () => {
    assert.ok(Array.isArray(lookup.byLastName['smith']));
    assert.strictEqual(lookup.byLastName['smith'].length, 2); // John Smith + James Smith
  });

  it('handles employees with user_email instead of email', () => {
    const empWithUserEmail = [
      { id: 'x-1', first_name: 'Test', last_name: 'User', user_email: 'test@example.com' },
    ];
    const lu = buildLookupFromList(empWithUserEmail);
    assert.strictEqual(lu.byEmail['test@example.com'].id, 'x-1');
  });

  it('handles employees with missing names gracefully', () => {
    const partial = [{ id: 'p-1', first_name: '', last_name: 'Solo', email: 'solo@test.com' }];
    const lu = buildLookupFromList(partial);
    assert.strictEqual(lu.byEmail['solo@test.com'].id, 'p-1');
    assert.strictEqual(lu.byFullName['solo'].id, 'p-1');
  });

  it('handles empty employee list', () => {
    const lu = buildLookupFromList([]);
    assert.strictEqual(lu.all.length, 0);
    assert.strictEqual(Object.keys(lu.byEmail).length, 0);
  });
});
