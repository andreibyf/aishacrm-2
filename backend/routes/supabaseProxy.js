/**
 * Supabase Auth Proxy Routes
 * Provides a controlled proxy for Supabase Auth user endpoint to bypass
 * CORS wildcard origin restrictions when credentials or custom headers are required.
 *
 * Usage (frontend):
 *   GET /api/supabase-proxy/auth/user?access_token=XXXX
 *     or send header Authorization: Bearer XXXX
 *
 * The proxy forwards the token to Supabase /auth/v1/user and returns the JSON user.
 * Adds explicit CORS headers with the requesting Origin to satisfy credentialed requests.
 */
import express from 'express';

// Lightweight in-memory rate limiter (dependency-free)
const ipBuckets = new Map(); // key -> { count, ts }
const WINDOW_MS = parseInt(process.env.SUPABASE_PROXY_WINDOW_MS || '60000', 10);
const MAX_REQ = parseInt(process.env.SUPABASE_PROXY_MAX_REQ || '30', 10); // generous default
function rateLimit(req, res) {
  // Allow OPTIONS freely
  if (req.method === 'OPTIONS') return true;
  const now = Date.now();
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  const entry = ipBuckets.get(ip);
  if (!entry || now - entry.ts >= WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, ts: now });
    return true;
  }
  if (entry.count < MAX_REQ) {
    entry.count++;
    return true;
  }
  res.setHeader('Retry-After', Math.ceil((entry.ts + WINDOW_MS - now) / 1000));
  res.status(429).json({ status: 'error', message: 'Too Many Requests' });
  return false;
}

export default function createSupabaseProxyRoutes() {
  const router = express.Router();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  if (!SUPABASE_URL) {
    console.warn('[SupabaseProxy] SUPABASE_URL not set – routes will return 503');
  }

  // Build explicit allowlist: SUPABASE_PROXY_ALLOWED_ORIGINS (comma separated)
  // Falls back to FRONTEND_URL for convenience. Never wildcard when credentials involved.
  const allowedOrigins = [...new Set([
    ...(process.env.SUPABASE_PROXY_ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || []),
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
    "https://app.aishacrm.com",
    "https://api.aishacrm.com",
    // Development defaults (only when NODE_ENV !== 'production')
    ...(process.env.NODE_ENV === 'production' ? [] : [
      'http://localhost:5173','https://localhost:5173','http://localhost:4000','https://localhost:4000'
    ])
  ])];

  function setCors(req, res) {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    } else if (!origin) {
      // Non-browser / server-to-server usage: allow (no credentials)
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    } else {
      // Origin not allowed: do NOT set credentialed CORS headers
      res.setHeader('Vary', 'Origin');
    }
  }

  router.options('/auth/user', (req, res) => {
    setCors(req, res);
    return res.sendStatus(204);
  });

  router.get('/auth/user', async (req, res) => {
    try {
      if (!rateLimit(req, res)) return; // early return on limit exceeded
      setCors(req, res);

      // Enforce origin allowlist when browser supplies Origin header
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        return res.status(403).json({ status: 'error', message: 'Origin not allowed' });
      }

      if (!SUPABASE_URL) {
        return res.status(503).json({ status: 'error', message: 'SUPABASE_URL not configured' });
      }

      // Extract access token from Authorization header or query parameter
      const authHeader = req.headers.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const queryToken = req.query.access_token ? String(req.query.access_token).trim() : null;
      const token = bearerToken || queryToken;

      if (!token) {
        return res.status(400).json({ status: 'error', message: 'access_token (query) or Authorization Bearer token required' });
      }

      // Basic JWT structural validation: three segments, header+payload base64-ish
      const parts = token.split('.');
      if (parts.length !== 3 || parts.some(p => p.length === 0)) {
        return res.status(400).json({ status: 'error', message: 'Malformed JWT token' });
      }
      // Optional length guard (avoid extremely large tokens)
      if (token.length > 5000) {
        return res.status(400).json({ status: 'error', message: 'Token length exceeds reasonable JWT size' });
      }

      const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
      const upstreamResp = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      // Minimal error surface: do not relay full upstream body on error
      if (!upstreamResp.ok) {
        return res.status(upstreamResp.status).json({
          status: 'error',
          message: 'Upstream Supabase request failed',
          upstream_status: upstreamResp.status
        });
      }

      const text = await upstreamResp.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return res.json({ status: 'success', data });
    } catch (e) {
      console.error('[SupabaseProxy] /auth/user error:', e?.message || e);
      return res.status(500).json({ status: 'error', message: 'Internal proxy error' });
    }
  });

  return router;
}
