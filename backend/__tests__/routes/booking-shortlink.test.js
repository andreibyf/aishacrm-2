import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
// eslint-disable-next-line no-restricted-imports
import pg from 'pg';

const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

async function resolveExistingCalcomLink(pool) {
  const { rows } = await pool.query(
    `SELECT u.username, et.slug
       FROM "EventType" et
       JOIN users u ON u.id = et."userId"
      ORDER BY et.id ASC
      LIMIT 1`,
  );

  if (!rows.length) {
    throw new Error('No Cal.com booking path found in test DB');
  }

  return {
    username: rows[0].username,
    slug: rows[0].slug,
  };
}

async function createServer() {
  process.env.CALCOM_DB_URL ||= 'postgresql://calcom:calcom_local@calcom-db:5432/calcom';

  const moduleUrl = new URL('../../routes/booking-shortlink.js', import.meta.url);
  moduleUrl.searchParams.set('test', `${Date.now()}-${Math.random()}`);
  const { shortlinkCreateRouter, shortlinkRedirectRouter } = await import(moduleUrl.href);

  const app = express();
  app.use(express.json());
  app.use('/api/scheduling/shortlink', shortlinkCreateRouter);
  app.use('/book', shortlinkRedirectRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

test(
  'booking shortlink persists in calcom-db and redirects to the Cal.com URL',
  { skip: !SHOULD_RUN },
  async () => {
    const server = await createServer();
    const pool = new pg.Pool({
      connectionString: process.env.CALCOM_DB_URL,
      ssl: false,
      max: 1,
    });

    try {
      const link = await resolveExistingCalcomLink(pool);
      const url = `https://app.cal.com/${link.username}/${link.slug}?email=client%40example.com`;

      const address = server.address();
      const createRes = await fetch(`http://127.0.0.1:${address.port}/api/scheduling/shortlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const createJson = await createRes.json();

      assert.equal(createRes.status, 201);
      assert.ok(createJson.token, 'shortlink token should be returned');
      assert.ok(createJson.shortUrl, 'shortUrl should be returned');

      const stored = await pool.query(
        `SELECT token, destination_url, expires_at
         FROM aisha_booking_shortlinks
        WHERE token = $1
        LIMIT 1`,
        [createJson.token],
      );

      assert.equal(stored.rowCount, 1, 'shortlink row should persist in calcom-db');
      assert.equal(
        stored.rows[0].destination_url,
        url,
        'destination URL should be stored in calcom-db',
      );

      const redirectRes = await fetch(`http://127.0.0.1:${address.port}/book/${createJson.token}`, {
        redirect: 'manual',
      });

      assert.equal(redirectRes.status, 302);
      assert.equal(redirectRes.headers.get('location'), url);
    } finally {
      await pool.query('DELETE FROM aisha_booking_shortlinks').catch(() => {});
      await pool.end().catch(() => {});
      server.close();
    }
  },
);

test('booking shortlink rejects non-Cal.com origins', { skip: !SHOULD_RUN }, async () => {
  const server = await createServer();
  const pool = new pg.Pool({
    connectionString: process.env.CALCOM_DB_URL,
    ssl: false,
    max: 1,
  });

  try {
    const link = await resolveExistingCalcomLink(pool);
    const address = server.address();
    const url = `https://evil.example/${link.username}/${link.slug}?email=client%40example.com`;

    const createRes = await fetch(`http://127.0.0.1:${address.port}/api/scheduling/shortlink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    assert.equal(createRes.status, 400);
  } finally {
    await pool.end().catch(() => {});
    server.close();
  }
});
