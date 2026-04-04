/**
 * Booking Short-Link Service
 *
 * Creates vanity short links that redirect to Cal.com booking URLs
 * that contain pre-filled fields and CRM metadata params.
 *
 * Storage:
 *   - Shortlink mappings are persisted in the Cal.com PostgreSQL container
 *   - The redirect target is revalidated against Cal.com before redirecting
 *
 * Routers (mounted separately in server.js):
 *   shortlinkCreateRouter - POST /api/scheduling/shortlink  (requires auth)
 *   shortlinkRedirectRouter - GET /book/:token              (public)
 */

import express from 'express';
import crypto from 'crypto';
import logger from '../lib/logger.js';
import { getCalcomDb } from '../lib/calcomDb.js';
import { validateCalcomBookingUrl } from '../lib/calcomLinkValidation.js';

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const TABLE_NAME = 'aisha_booking_shortlinks';
const DEFAULT_CALCOM_ORIGINS = ['https://app.cal.com', 'http://localhost:3002'];

function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function getAllowedCalcomOrigins() {
  const envOrigins = [
    process.env.CALCOM_PUBLIC_URL,
    process.env.CALCOM_NEXTAUTH_URL,
    process.env.CALCOM_URL,
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return new Set([...DEFAULT_CALCOM_ORIGINS, ...envOrigins]);
}

function isAllowedCalcomOrigin(origin) {
  return getAllowedCalcomOrigins().has(origin);
}

function generateToken() {
  // 6 random bytes -> 8 base64url chars (URL-safe, no padding)
  return crypto.randomBytes(6).toString('base64url');
}

let ensureTablePromise = null;

async function ensureShortlinkTable(db) {
  if (!db) return false;
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          token TEXT PRIMARY KEY,
          destination_url TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_expires_at
          ON ${TABLE_NAME} (expires_at)
      `);
      return true;
    })().catch((err) => {
      ensureTablePromise = null;
      throw err;
    });
  }

  await ensureTablePromise;
  return true;
}

async function persistShortlink(db, token, destinationUrl) {
  await db.query(
    `INSERT INTO ${TABLE_NAME} (token, destination_url, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval)`,
    [token, destinationUrl, TTL_SECONDS],
  );
}

async function lookupShortlink(db, token) {
  const { rows } = await db.query(
    `SELECT token, destination_url, expires_at
       FROM ${TABLE_NAME}
      WHERE token = $1
      LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}

async function deleteShortlink(db, token) {
  await db.query(`DELETE FROM ${TABLE_NAME} WHERE token = $1`, [token]);
}

// ---------------------------------------------------------------------------
// POST /api/scheduling/shortlink
// Auth required (applied in server.js mount).
// Body: { url: string }  - the full Cal.com booking URL to shorten
// Returns: { token, shortUrl }
// ---------------------------------------------------------------------------
export const shortlinkCreateRouter = express.Router();

shortlinkCreateRouter.post('/', async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'URL must use http or https' });
  }

  const db = getCalcomDb();
  if (!db) {
    logger.warn('[ShortLink] calcom-db unavailable, cannot create short link');
    return res.json({ token: null, shortUrl: null });
  }

  try {
    await ensureShortlinkTable(db);

    const validation = await validateCalcomBookingUrl(db, parsed.toString());
    if (!validation.valid) {
      return res.status(404).json({
        error: 'Cal.com booking page not configured or no longer exists',
      });
    }

    if (!isAllowedCalcomOrigin(parsed.origin)) {
      return res.status(400).json({
        error: 'Unsupported Cal.com origin',
      });
    }

    const token = generateToken();
    await persistShortlink(db, token, parsed.toString());

    logger.info('[ShortLink] Created', { token });
    return res.status(201).json({
      token,
      shortUrl: `${req.protocol}://${req.get('host')}/book/${token}`,
    });
  } catch (err) {
    logger.error({ err }, '[ShortLink] Failed to write to calcom-db');
    return res.json({ token: null, shortUrl: null });
  }
});

// ---------------------------------------------------------------------------
// GET /book/:token
// Public - no auth. Redirects to the stored Cal.com URL.
// ---------------------------------------------------------------------------
export const shortlinkRedirectRouter = express.Router();

shortlinkRedirectRouter.get('/:token', async (req, res) => {
  const { token } = req.params;

  if (!/^[A-Za-z0-9_-]{8}$/.test(token)) {
    return res.status(404).send('Not found');
  }

  const db = getCalcomDb();
  if (!db) {
    return res.status(503).send('Service temporarily unavailable');
  }

  try {
    await ensureShortlinkTable(db);

    const row = await lookupShortlink(db, token);
    if (!row) {
      return res.status(404).send('Booking link not found or expired');
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await deleteShortlink(db, token).catch(() => {});
      return res.status(404).send('Booking link not found or expired');
    }

    const validation = await validateCalcomBookingUrl(db, row.destination_url);
    if (!validation.valid) {
      await deleteShortlink(db, token).catch(() => {});
      return res.status(404).send('Booking page not configured');
    }

    return res.redirect(302, validation.url);
  } catch (err) {
    logger.error({ err }, '[ShortLink] calcom-db read error');
    return res.status(503).send('Service temporarily unavailable');
  }
});
