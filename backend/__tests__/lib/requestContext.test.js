import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attachRequestContext, addDbTime, getRequestDbTime } from '../../lib/requestContext.js';

describe('requestContext', () => {
  it('initializes dbTime and accumulates via addDbTime', async () => {
    const req = {};

    await new Promise((resolve) => {
      attachRequestContext(req, {}, () => {
        assert.equal(req.dbTimeMs, 0);
        addDbTime(10.2);
        addDbTime(5.1);
        assert.equal(getRequestDbTime(req), 16);
        resolve();
      });
    });
  });

  it('returns 0 outside request context and ignores invalid additions', () => {
    addDbTime('not-a-number');
    assert.equal(getRequestDbTime(), 0);
  });

  it('reads value from req when provided', () => {
    const req = { dbTimeMs: 4.2 };
    assert.equal(getRequestDbTime(req), 5);
  });
});
