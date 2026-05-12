/**
 * Regression test for the 429 refresh-storm fix.
 *
 * Before the fix: /api/auth/refresh was mounted behind the blanket authLimiter
 * (10/min/IP). Combined with a broken useTokenRefresh hook that could never
 * proactively refresh (httpOnly cookie unreadable by JS), every session would
 * expire hard at 15 minutes and the frontend would fire N parallel 401 retries.
 * N quickly exceeded 10/min and the user saw a cascade of 429s.
 *
 * After the fix: refresh + /me sit behind a dedicated refreshLimiter (60/min,
 * skipSuccessfulRequests) while /login + /password/reset/* still use the
 * stricter authLimiter (10/min) they always had.
 *
 * These tests pin those limits down.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimiter.js';

// Force rate limiting ON even in the vitest environment (skipForTests is otherwise true).
// We achieve this by wrapping routes in our own mini-app with NODE_ENV temporarily cleared.
function makeApp(limiter, handler) {
  const app = express();
  // rate-limit keys off req.ip; for tests we set a fake trust proxy so each test run
  // is isolated, and we supply a unique keyGenerator at the limiter level.
  app.set('trust proxy', true);
  app.get('/probe', limiter, handler);
  return app;
}

// Unique-per-run base to prevent MemoryStore counter bleed between repeated
// invocations within the same Node process (middleware group runs all files
// in one process; fixed IPs collide if the limiter's store isn't reset).
const RUN_ID = Date.now() % 65536; // fits two octets

describe('rateLimiter: refreshLimiter (for /api/auth/refresh + /api/auth/me)', () => {
  beforeEach(() => {
    // Ensure skipForTests returns FALSE during this test by clearing both env vars.
    delete process.env.NODE_ENV;
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it('allows up to 60 FAILED requests per minute before rejecting', async () => {
    // Simulate failed refresh attempts (400 = failure). Only failures count
    // because the limiter is configured with skipSuccessfulRequests: true.
    const app = makeApp(refreshLimiter, (_req, res) => res.status(400).json({ ok: false }));
    const ip = `10.${RUN_ID >> 8}.${RUN_ID & 0xff}.1`; // unique per test-run

    const statuses = [];
    for (let i = 0; i < 62; i++) {
      const resp = await request(app).get('/probe').set('X-Forwarded-For', ip);
      statuses.push(resp.status);
    }

    const accepted = statuses.filter((s) => s === 400).length;
    const rejected = statuses.filter((s) => s === 429).length;

    assert.strictEqual(accepted, 60);
    assert.strictEqual(rejected, 2);
  });

  it('does NOT count successful requests against the limit (skipSuccessfulRequests)', async () => {
    const app = makeApp(refreshLimiter, (_req, res) => res.status(200).json({ ok: true }));
    const ip = `10.${RUN_ID >> 8}.${RUN_ID & 0xff}.2`; // unique per test-run

    // Fire 100 successful requests — all should succeed because successes don't count.
    const statuses = [];
    for (let i = 0; i < 100; i++) {
      const resp = await request(app).get('/probe').set('X-Forwarded-For', ip);
      statuses.push(resp.status);
    }

    assert.strictEqual(
      statuses.every((s) => s === 200),
      true,
    );
  });

  it('refreshLimiter ceiling (60/min) is strictly higher than authLimiter ceiling (10/min)', async () => {
    // Two apps, same input, different limiters — prove authLimiter is the stricter one.
    const appAuth = makeApp(authLimiter, (_req, res) => res.status(400).json({ ok: false }));
    const appRefresh = makeApp(refreshLimiter, (_req, res) => res.status(400).json({ ok: false }));
    const ipAuth = `10.${RUN_ID >> 8}.${RUN_ID & 0xff}.3`;
    const ipRefresh = `10.${RUN_ID >> 8}.${RUN_ID & 0xff}.4`;

    const authStatuses = [];
    for (let i = 0; i < 15; i++) {
      const resp = await request(appAuth).get('/probe').set('X-Forwarded-For', ipAuth);
      authStatuses.push(resp.status);
    }

    const refreshStatuses = [];
    for (let i = 0; i < 15; i++) {
      const resp = await request(appRefresh).get('/probe').set('X-Forwarded-For', ipRefresh);
      refreshStatuses.push(resp.status);
    }

    // authLimiter should have thrown 429 at some point in 15 attempts
    assert.ok(authStatuses.filter((s) => s === 429).length > 0);
    // refreshLimiter should NOT have thrown 429 yet at 15 attempts (ceiling is 60)
    assert.strictEqual(refreshStatuses.filter((s) => s === 429).length, 0);
  });
});
