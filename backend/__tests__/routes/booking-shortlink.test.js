import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import pg from 'pg';

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

test('booking shortlink persists in calcom-db and redirects to the Cal.com URL', async () => {
  const server = await createServer();
  const pool = new pg.Pool({
    connectionString: process.env.CALCOM_DB_URL,
    ssl: false,
    max: 1,
  });

  const url = 'https://app.cal.com/aishacrm-superadmin/dev-playground-b62b76?email=client%40example.com';

  try {
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
    assert.equal(stored.rows[0].destination_url, url, 'destination URL should be stored in calcom-db');

    const redirectRes = await fetch(`http://127.0.0.1:${address.port}/book/${createJson.token}`, {
      redirect: 'manual',
    });

    assert.equal(redirectRes.status, 302);
    assert.equal(redirectRes.headers.get('location'), url);
  } finally {
    await pool.query('DELETE FROM aisha_booking_shortlinks WHERE destination_url = $1', [url]).catch(() => {});
    await pool.end().catch(() => {});
    server.close();
  }
});
