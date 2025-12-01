import express from 'express';

const REALTIME_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const DEFAULT_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
const REALTIME_MODULE_NAME = 'Realtime Voice';

const extractClientSecret = (payload) => {
  if (!payload) return { value: null, expires_at: null };
  if (payload?.client_secret) {
    return {
      value: payload.client_secret.value || null,
      expires_at: payload.client_secret.expires_at || null,
    };
  }
  return {
    value: payload.value || null,
    expires_at: payload.expires_at || null,
  };
};

const normalizeTenantId = (value) => {
  if (!value) return null;
  const str = String(value);
  if (!str || str === 'null' || str === 'undefined') {
    return null;
  }
  return str;
};

export default function createAiRealtimeRoutes(pgPool) {
  const router = express.Router();

  const isRealtimeModuleEnabled = async (tenantId) => {
    if (!pgPool) return true;
    const normalizedTenantId = normalizeTenantId(tenantId);
    try {
      if (normalizedTenantId) {
        const tenantRow = await pgPool.query(
          'SELECT is_enabled FROM modulesettings WHERE tenant_id = $1 AND module_name = $2 ORDER BY updated_at DESC LIMIT 1',
          [normalizedTenantId, REALTIME_MODULE_NAME]
        );
        if (tenantRow.rows.length > 0) {
          return tenantRow.rows[0].is_enabled !== false;
        }
      }

      const defaultRow = await pgPool.query(
        'SELECT is_enabled FROM modulesettings WHERE tenant_id IS NULL AND module_name = $1 ORDER BY updated_at DESC LIMIT 1',
        [REALTIME_MODULE_NAME]
      );
      if (defaultRow.rows.length > 0) {
        return defaultRow.rows[0].is_enabled !== false;
      }
      return true;
    } catch (error) {
      console.error('[AI][Realtime] Module lookup failed', {
        message: error?.message,
        tenantId: normalizedTenantId || 'unknown',
      });
      return true;
    }
  };

  router.get('/realtime-token', async (req, res) => {
    const startedAt = Date.now();
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error('[AI][Realtime] OPENAI_API_KEY missing while minting realtime token');
        return res.status(500).json({ status: 'error', message: 'Realtime voice is not configured' });
      }

      const tenantIdFromQuery = normalizeTenantId(req.query?.tenant_id);
      const tenantIdFromUser = normalizeTenantId(req.user?.tenant_id);
      const tenantId = tenantIdFromQuery || tenantIdFromUser || null;
      const moduleEnabled = await isRealtimeModuleEnabled(tenantId);
      if (!moduleEnabled) {
        console.warn('[AI][Realtime] Token request blocked by module settings', {
          tenantId: tenantId || 'unknown',
          userId: req.user?.id || 'anonymous',
        });
        return res.status(403).json({
          status: 'error',
          message: 'Realtime Voice module is disabled for this tenant',
        });
      }

      const sessionPayload = {
        session: {
          type: 'realtime',
          model: DEFAULT_REALTIME_MODEL,
          audio: {
            output: {
              voice: DEFAULT_REALTIME_VOICE,
            },
          },
        },
      };

      const response = await fetch(REALTIME_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI][Realtime] Failed to mint token', {
          status: response.status,
          body: errorText,
          tenantId: tenantId || 'unknown',
        });
        return res.status(response.status).json({
          status: 'error',
          message: 'Failed to create realtime session',
          details: errorText || null,
        });
      }

      const payload = await response.json();
      const secret = extractClientSecret(payload);

      if (!secret.value) {
        console.error('[AI][Realtime] Token response missing value', payload);
        return res.status(502).json({ status: 'error', message: 'Realtime service returned invalid token' });
      }

      console.info('[AI][Realtime] Token minted', {
        tenantId: tenantId || 'unknown',
        userId: req.user?.id || 'anonymous',
        durationMs: Date.now() - startedAt,
      });

      return res.json({
        status: 'success',
        value: secret.value,
        expires_at: secret.expires_at,
      });
    } catch (error) {
      console.error('[AI][Realtime] Error minting token', {
        message: error?.message,
      });
      return res.status(500).json({ status: 'error', message: 'Unable to mint realtime token' });
    }
  });

  return router;
}
