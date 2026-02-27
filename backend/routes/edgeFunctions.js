import express from 'express';
import logger from '../lib/logger.js';

// Derive Supabase functions base from SUPABASE_URL
// Support both subdomain style (functions.supabase.co) and path style (/functions/v1)
const supabaseUrl = process.env.SUPABASE_URL || '';
function getFunctionsBase() {
  if (!supabaseUrl) return '';
  const trimmed = supabaseUrl.replace(/\/$/, '');
  // If URL already points to functions endpoint (path style)
  if (trimmed.includes('/functions/v1')) return trimmed;
  // Default to path style: https://project.supabase.co/functions/v1
  if (trimmed.includes('.supabase.co')) return `${trimmed}/functions/v1`;
  // Fallback to original
  return trimmed;
}
const functionsBase = getFunctionsBase();

function buildUpstreamUrl(path) {
  if (!functionsBase) return null;
  const base = functionsBase.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function copyAuthHeaders(req) {
  const headers = {};
  const auth = req.headers.authorization;
  if (auth) headers['Authorization'] = auth;
  const tenantId = req.headers['x-tenant-id'];
  if (tenantId) headers['x-tenant-id'] = tenantId;
  const tenantSlug = req.headers['x-tenant-slug'];
  if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;
  return headers;
}

async function forwardGet(req, res, upstreamPath) {
  const target = buildUpstreamUrl(upstreamPath);
  if (!target) {
    return res
      .status(503)
      .json({ status: 'error', message: 'SUPABASE_URL not configured for functions proxy' });
  }
  try {
    logger.debug('[EdgeFunctionsProxy] Forwarding GET to', target);
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        ...copyAuthHeaders(req),
      },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok) {
      logger.error('[EdgeFunctionsProxy] Upstream error', {
        status: upstream.status,
        url: target,
        contentType,
        bodyPreview: text?.slice(0, 800),
      });
    }
    res.status(upstream.status);
    if (contentType.includes('application/json')) {
      try {
        return res.json(JSON.parse(text));
      } catch {
        return res.send(text);
      }
    }
    return res.send(text);
  } catch (e) {
    logger.error('[EdgeFunctionsProxy] forward exception', e?.message || e);
    return res.status(500).json({ status: 'error', message: 'Edge function proxy failure' });
  }
}

async function forwardPost(req, res, upstreamPath) {
  const target = buildUpstreamUrl(upstreamPath);
  if (!target) {
    return res
      .status(503)
      .json({ status: 'error', message: 'SUPABASE_URL not configured for functions proxy' });
  }
  try {
    logger.debug('[EdgeFunctionsProxy] Forwarding POST to', target);
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        ...copyAuthHeaders(req),
        'Content-Type': 'application/json',
      },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok) {
      logger.error('[EdgeFunctionsProxy] Upstream error', {
        status: upstream.status,
        url: target,
        contentType,
        bodyPreview: text?.slice(0, 800),
      });
    }
    res.status(upstream.status);
    if (contentType.includes('application/json')) {
      try {
        return res.json(JSON.parse(text));
      } catch {
        return res.send(text);
      }
    }
    return res.send(text);
  } catch (e) {
    logger.error('[EdgeFunctionsProxy] forward exception', e?.message || e);
    return res.status(500).json({ status: 'error', message: 'Edge function proxy failure' });
  }
}

export default function createEdgeFunctionRoutes() {
  const router = express.Router();

  // Preflight handler for proxy endpoints
  // Express 5 requires named wildcard parameters (bare '*' is no longer valid)
  router.options('/{*path}', (_req, res) => {
    res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, x-tenant-id, x-tenant-slug',
    );
    return res.sendStatus(204);
  });

  router.get('/mint-lead-link', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ status: 'error', message: 'id is required' });
    const path = `/mint-lead-link?id=${encodeURIComponent(String(id))}`;
    return forwardGet(req, res, path);
  });

  router.get('/person-profile/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'id is required' });
    const path = `/person-profile/${encodeURIComponent(String(id))}`;
    return forwardGet(req, res, path);
  });

  router.post('/person-refresh/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: 'error', message: 'id is required' });
    const path = `/person-refresh/${encodeURIComponent(String(id))}`;
    return forwardPost(req, res, path);
  });

  // List/search endpoint passthrough: /person-profile?type=lead|contact&tenant_id=...&email=...&q=...&limit=...&offset=...&order_by=...&direction=...
  router.get('/person-profile', async (req, res) => {
    // Reconstruct query string transparently
    const query = new URLSearchParams(req.query).toString();
    const path = `/person-profile${query ? `?${query}` : ''}`;
    return forwardGet(req, res, path);
  });

  return router;
}
