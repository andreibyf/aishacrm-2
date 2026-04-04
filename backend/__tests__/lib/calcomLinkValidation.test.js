import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCalcomBookingUrl,
  parseCalcomLink,
  validateCalcomLink,
} from '../../lib/calcomLinkValidation.js';

describe('parseCalcomLink', () => {
  test('parses username and slug', () => {
    assert.deepEqual(parseCalcomLink('jane/30min'), {
      calLink: 'jane/30min',
      username: 'jane',
      slug: '30min',
    });
  });

  test('parses username only', () => {
    assert.deepEqual(parseCalcomLink('jane'), {
      calLink: 'jane',
      username: 'jane',
      slug: null,
    });
  });

  test('rejects invalid shapes', () => {
    assert.equal(parseCalcomLink(''), null);
    assert.equal(parseCalcomLink('jane/30min/extra'), null);
    assert.equal(parseCalcomLink(null), null);
  });
});

describe('parseCalcomBookingUrl', () => {
  test('parses a full booking URL into origin and cal link', () => {
    assert.deepEqual(
      parseCalcomBookingUrl('https://app.cal.com/jane/30min?email=test@example.com'),
      {
        calLink: 'jane/30min',
        username: 'jane',
        slug: '30min',
        origin: 'https://app.cal.com',
        url: 'https://app.cal.com/jane/30min?email=test@example.com',
      },
    );
  });
});

describe('validateCalcomLink', () => {
  test('accepts an existing user and event type slug', async () => {
    const db = {
      query: async (sql, params) => {
        if (String(sql).includes('FROM users')) {
          return { rows: [{ id: 42, username: params[0] }] };
        }
        if (String(sql).includes('FROM "EventType"')) {
          return { rows: [{ id: 99, slug: params[1] }] };
        }
        return { rows: [] };
      },
    };

    const result = await validateCalcomLink(db, 'jane/30min');
    assert.equal(result.valid, true);
    assert.equal(result.calLink, 'jane/30min');
    assert.equal(result.userId, 42);
    assert.equal(result.eventTypeId, 99);
  });

  test('rejects missing user', async () => {
    const db = {
      query: async () => ({ rows: [] }),
    };

    const result = await validateCalcomLink(db, 'missing/30min');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'user_not_found');
  });

  test('rejects missing event type slug', async () => {
    const db = {
      query: async (sql, params) => {
        if (String(sql).includes('FROM users')) {
          return { rows: [{ id: 42, username: params[0] }] };
        }
        return { rows: [] };
      },
    };

    const result = await validateCalcomLink(db, 'jane/does-not-exist');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'event_type_not_found');
  });
});
