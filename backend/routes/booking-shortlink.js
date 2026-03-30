/**
 * Booking Short-Link Service
 *
 * Creates vanity short links that redirect to Cal.com booking URLs
 * that contain pre-filled fields and CRM metadata params.
 *
 * Routers (mounted separately in server.js):
 *   shortlinkCreateRouter — POST /api/scheduling/shortlink  (requires auth)
 *   shortlinkRedirectRouter — GET /book/:token              (public)
 */

import express from 'express';
import crypto from 'crypto';
import logger from '../lib/logger.js';

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function generateToken() {
  // 6 random bytes → 8 base64url chars (URL-safe, no padding)
  return crypto.randomBytes(6).toString('base64url');
}

function getRedisClient(req) {
  return req.app?.locals?.cacheManager?.client ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/scheduling/shortlink
// Auth required (applied in server.js mount).
// Body: { url: string }  — the full Cal.com booking URL to shorten
// Returns: { token, shortUrl }
// ---------------------------------------------------------------------------
export const shortlinkCreateRouter = express.Router();

shortlinkCreateRouter.post('/', async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  // Basic URL safety validation — must be http/https, no javascript: or data: schemes
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'URL must use http or https' });
  }

  const redis = getRedisClient(req);
  if (!redis) {
    // Redis unavailable — degrade gracefully, return null so client falls back to full link
    logger.warn('[ShortLink] Redis unavailable, cannot create short link');
    return res.json({ token: null, shortUrl: null });
  }

  const token = generateToken();
  const key = `shortlink:${token}`;

  try {
    await redis.set(key, url, { EX: TTL_SECONDS });
  } catch (err) {
    logger.error({ err }, '[ShortLink] Failed to write to Redis');
    return res.json({ token: null, shortUrl: null });
  }

  logger.info('[ShortLink] Created', { token });
  return res.status(201).json({ token });
});

// ---------------------------------------------------------------------------
// GET /book/:token
// Public — no auth.  Redirects to the stored Cal.com URL.
// ---------------------------------------------------------------------------
export const shortlinkRedirectRouter = express.Router();

shortlinkRedirectRouter.get('/:token', async (req, res) => {
  const { token } = req.params;

  // Validate token shape (8 base64url chars) to avoid Redis probing
  if (!/^[A-Za-z0-9_-]{8}$/.test(token)) {
    return res.status(404).send('Not found');
  }

  const redis = getRedisClient(req);
  if (!redis) {
    return res.status(503).send('Service temporarily unavailable');
  }

  let destination;
  try {
    destination = await redis.get(`shortlink:${token}`);
  } catch (err) {
    logger.error({ err }, '[ShortLink] Redis read error');
    return res.status(503).send('Service temporarily unavailable');
  }

  if (!destination) {
    return res.status(404).send('Booking link not found or expired');
  }

  // 302 so browsers don't cache; customer may share the same token link multiple times
  return res.redirect(302, destination);
});
