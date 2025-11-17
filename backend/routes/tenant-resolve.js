import express from 'express';
import { resolveCanonicalTenant, getTenantResolveCacheStats, clearTenantResolveCache } from '../lib/tenantCanonicalResolver.js';

export default function createTenantResolveRoutes(_pgPool) { // pgPool unused but kept for signature consistency
  const router = express.Router();

  // GET /api/tenantresolve/metrics - Prometheus-style metrics (must be before /:identifier)
  router.get('/metrics', (req, res) => {
    try {
      const stats = getTenantResolveCacheStats();
      const lines = [
        '# HELP tenant_resolve_cache_size Current number of cached tenant resolutions',
        '# TYPE tenant_resolve_cache_size gauge',
        `tenant_resolve_cache_size ${stats.size}`,
        '',
        '# HELP tenant_resolve_cache_hits_total Total number of cache hits',
        '# TYPE tenant_resolve_cache_hits_total counter',
        `tenant_resolve_cache_hits_total ${stats.hits}`,
        '',
        '# HELP tenant_resolve_cache_misses_total Total number of cache misses',
        '# TYPE tenant_resolve_cache_misses_total counter',
        `tenant_resolve_cache_misses_total ${stats.misses}`,
        '',
        '# HELP tenant_resolve_cache_hit_ratio Current cache hit ratio (0-1)',
        '# TYPE tenant_resolve_cache_hit_ratio gauge',
        `tenant_resolve_cache_hit_ratio ${stats.hitRatio.toFixed(4)}`,
        '',
        '# HELP tenant_resolve_cache_ttl_ms Cache TTL in milliseconds',
        '# TYPE tenant_resolve_cache_ttl_ms gauge',
        `tenant_resolve_cache_ttl_ms ${stats.ttlMs}`,
        '',
      ];
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      return res.send(lines.join('\n'));
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // POST /api/tenantresolve/reset - clear cache and reset counters (must be before /:identifier)
  router.post('/reset', (req, res) => {
    try {
      clearTenantResolveCache();
      return res.json({ status: 'success', message: 'Tenant resolve cache cleared' });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // Batch resolve: /api/tenantresolve?ids=a,b,c&stats=true
  router.get('/', async (req, res) => {
    try {
      const raw = req.query.ids;
      if (!raw) {
        return res.status(400).json({ status: 'error', message: 'ids query parameter required' });
      }
      const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid identifiers provided' });
      }
      const results = [];
      for (const id of parts) {
        const resolved = await resolveCanonicalTenant(id);
        results.push({ input: id, ...resolved });
      }
      const payload = { status: 'success', data: results };
      if (req.query.stats === 'true') {
        payload.cache = getTenantResolveCacheStats();
      }
      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/tenantresolve/:identifier?stats=true - resolve canonical tenant
  router.get('/:identifier', async (req, res, _pgPool) => {
    try {
      const { identifier } = req.params;
      const result = await resolveCanonicalTenant(identifier);
      const payload = { status: 'success', data: result };
      if (req.query.stats === 'true') {
        payload.cache = getTenantResolveCacheStats();
      }
      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  return router;
}
