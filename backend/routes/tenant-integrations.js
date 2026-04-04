import express from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { validateTenantScopedId } from '../lib/validation.js';
import logger from '../lib/logger.js';
import { supabase } from '../services/supabaseClient.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { getCalcomDb } from '../lib/calcomDb.js';
import {
  isCommunicationsProviderIntegration,
  validateCommunicationsProviderConfig,
} from '../lib/communicationsConfig.js';

const CALCOM_WEBHOOK_EVENTS = [
  'BOOKING_CREATED',
  'BOOKING_CANCELLED',
  'BOOKING_RESCHEDULED',
  'BOOKING_REJECTED',
  'BOOKING_REQUESTED',
];

function slugify(value) {
  const input = String(value || '').toLowerCase();
  let output = '';
  let lastWasDash = false;

  for (let i = 0; i < input.length && output.length < 40; i += 1) {
    const ch = input[i];
    const code = ch.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowerAlpha = code >= 97 && code <= 122;

    if (isDigit || isLowerAlpha) {
      output += ch;
      lastWasDash = false;
      continue;
    }

    if (output.length > 0 && !lastWasDash) {
      output += '-';
      lastWasDash = true;
    }
  }

  return output.endsWith('-') ? output.slice(0, -1) : output;
}

function hasMultipleValues(value) {
  return Array.isArray(value);
}

function asSingleString(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (hasMultipleValues(value)) {
    throw new Error(`${fieldName} must be a single value`);
  }
  return String(value);
}

function resolveBackendBaseUrl(req) {
  // Explicit override for Cal.com → AiSHA webhook callbacks (Docker-internal or production)
  const calcomUrl = process.env.CALCOM_WEBHOOK_BACKEND_URL;
  if (calcomUrl) return String(calcomUrl).replace(/\/$/, '');
  const envUrl = process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`.replace(/\/$/, '');
}

async function getTenantName(supabaseClient, tenantId) {
  const { data } = await supabaseClient
    .from('tenant')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();
  return data?.name || `Tenant ${tenantId.slice(0, 8)}`;
}

async function findCalcomUserById(db, userId) {
  if (!userId) return null;
  const parsedId = Number(userId);
  if (!Number.isFinite(parsedId)) return null;
  const result = await db.query(
    'SELECT id, username, email, name FROM users WHERE id = $1 LIMIT 1',
    [parsedId],
  );
  return result.rows[0] || null;
}

async function findCalcomUserByUsername(db, username) {
  const slug = slugify(username);
  if (!slug) return null;
  const result = await db.query(
    'SELECT id, username, email, name FROM users WHERE username = $1 LIMIT 1',
    [slug],
  );
  return result.rows[0] || null;
}

async function createCalcomUser(db, { tenantId, tenantName, baseUsername }) {
  const normalizedBase = slugify(baseUsername) || `tenant-${tenantId.slice(0, 8)}`;

  for (let i = 1; i <= 50; i++) {
    const candidate =
      i === 1 ? normalizedBase : `${normalizedBase}-${i === 2 ? tenantId.slice(0, 6) : i - 1}`;
    const email = `${candidate}-${tenantId.slice(0, 8)}@aishacrm.local`;
    try {
      const inserted = await db.query(
        `INSERT INTO users (username, name, email, uuid)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, email, name`,
        [candidate, tenantName, email, randomUUID()],
      );
      await ensureCalcomUserBootstrap(db, { userId: inserted.rows[0].id });
      return inserted.rows[0];
    } catch (err) {
      if (err?.code !== '23505') throw err;
    }
  }

  const userResult = await db.query(
    'SELECT id, username, email, name FROM users WHERE username LIKE $1 ORDER BY id DESC LIMIT 1',
    [`${normalizedBase}%`],
  );
  if (userResult.rows.length > 0) {
    await ensureCalcomUserBootstrap(db, { userId: userResult.rows[0].id });
    return userResult.rows[0];
  }

  throw new Error('Could not provision a unique Cal.com username');
}

async function findDefaultProvisionUser(db) {
  const preferredById = await findCalcomUserById(db, process.env.CALCOM_PROVISION_USER_ID);
  if (preferredById) return preferredById;

  const preferredByUsername = await findCalcomUserByUsername(
    db,
    process.env.CALCOM_PROVISION_USERNAME,
  );
  if (preferredByUsername) return preferredByUsername;

  const result = await db.query(
    `SELECT id, username, email, name
     FROM users
     WHERE "completedOnboarding" = true
     ORDER BY CASE WHEN role = 'ADMIN' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
  );
  return result.rows[0] || null;
}

async function ensureCalcomUserBootstrap(db, { userId }) {
  // Ensure user can be surfaced on public booking pages.
  await db.query(
    `UPDATE users
     SET "completedOnboarding" = true,
         "emailVerified" = COALESCE("emailVerified", NOW()),
         locale = COALESCE(locale, 'en'),
         "timeZone" = COALESCE("timeZone", 'America/New_York'),
         "weekStart" = COALESCE("weekStart", 'Sunday'),
         "allowSEOIndexing" = COALESCE("allowSEOIndexing", true),
         "allowDynamicBooking" = COALESCE("allowDynamicBooking", true),
         metadata = COALESCE(metadata, '{}'::jsonb)
     WHERE id = $1`,
    [userId],
  );

  const scheduleResult = await db.query(
    'SELECT id, "timeZone" FROM "Schedule" WHERE "userId" = $1 ORDER BY id ASC LIMIT 1',
    [userId],
  );

  let scheduleId = scheduleResult.rows[0]?.id || null;

  if (!scheduleId) {
    const createdSchedule = await db.query(
      `INSERT INTO "Schedule" ("userId", name, "timeZone")
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, 'Working hours', 'America/New_York'],
    );
    scheduleId = createdSchedule.rows[0].id;
  }

  await db.query(
    `UPDATE users
     SET "defaultScheduleId" = COALESCE("defaultScheduleId", $2)
     WHERE id = $1`,
    [userId, scheduleId],
  );

  const availabilityResult = await db.query(
    'SELECT id FROM "Availability" WHERE "scheduleId" = $1 LIMIT 1',
    [scheduleId],
  );

  if (availabilityResult.rows.length === 0) {
    await db.query(
      `INSERT INTO "Availability" ("scheduleId", days, "startTime", "endTime")
       VALUES ($1, $2, $3, $4)`,
      [scheduleId, [1, 2, 3, 4, 5], '09:00:00', '17:00:00'],
    );
  }
}

async function ensureCalcomUser(db, { tenantId, tenantName, requestedUserId, requestedUsername }) {
  const requestedUserById = await findCalcomUserById(db, requestedUserId);
  if (requestedUserById) {
    await ensureCalcomUserBootstrap(db, { userId: requestedUserById.id });
    return requestedUserById;
  }

  const requestedUser = await findCalcomUserByUsername(db, requestedUsername);
  if (requestedUser) {
    await ensureCalcomUserBootstrap(db, { userId: requestedUser.id });
    return requestedUser;
  }

  if (requestedUsername) {
    return createCalcomUser(db, {
      tenantId,
      tenantName,
      baseUsername: requestedUsername,
    });
  }

  const defaultProvisionUser = await findDefaultProvisionUser(db);
  if (defaultProvisionUser) {
    await ensureCalcomUserBootstrap(db, { userId: defaultProvisionUser.id });
    return defaultProvisionUser;
  }

  return createCalcomUser(db, {
    tenantId,
    tenantName,
    baseUsername: `${slugify(tenantName) || 'tenant'}-${tenantId.slice(0, 6)}`,
  });
}

async function ensureCalcomEventType(db, { userId, requestedSlug, requestedEventTypeId }) {
  if (requestedEventTypeId) {
    const existing = await db.query(
      'SELECT id, slug, title, length, "userId" FROM "EventType" WHERE id = $1 LIMIT 1',
      [Number(requestedEventTypeId)],
    );
    if (existing.rows.length > 0 && existing.rows[0].userId === userId) {
      await db.query(
        `UPDATE "EventType"
         SET hidden = false,
             locations = COALESCE(locations, '[{"type":"phone"}]'::jsonb)
         WHERE id = $1 AND "userId" = $2`,
        [existing.rows[0].id, userId],
      );
      return existing.rows[0];
    }

    if (existing.rows.length > 0) {
      logger.warn('[CalcomProvision] Ignoring requested event type from different user', {
        requestedEventTypeId,
        requestedUserId: existing.rows[0].userId,
        targetUserId: userId,
      });
    }
  }

  const slug = requestedSlug || null;
  const baseSlug = slug || `meeting-${Date.now().toString(36).slice(-4)}`;

  // Keep slug uniqueness scoped to userId when multiple tenants share one Cal.com user.
  let uniqueSlug = baseSlug;
  for (let i = 1; i <= 50; i++) {
    const check = await db.query(
      'SELECT id FROM "EventType" WHERE "userId" = $1 AND slug = $2 LIMIT 1',
      [userId, uniqueSlug],
    );
    if (check.rows.length === 0) break;
    uniqueSlug = `${baseSlug}-${i}`.slice(0, 64);
  }

  const existingBySlug = await db.query(
    'SELECT id, slug, title, length FROM "EventType" WHERE "userId" = $1 AND slug = $2 LIMIT 1',
    [userId, uniqueSlug],
  );
  if (existingBySlug.rows.length > 0) {
    await db.query(
      `UPDATE "EventType"
       SET hidden = false,
           locations = COALESCE(locations, '[{"type":"phone"}]'::jsonb)
       WHERE id = $1`,
      [existingBySlug.rows[0].id],
    );
    return existingBySlug.rows[0];
  }

  const inserted = await db.query(
    `INSERT INTO "EventType" (title, slug, length, "userId", locations)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id, slug, title, length`,
    ['30 min meeting', uniqueSlug, 30, userId, '[{"type":"phone"}]'],
  );
  return inserted.rows[0];
}

async function ensureCalcomWebhook(db, { userId, subscriberUrl, webhookSecret }) {
  const existing = await db.query(
    'SELECT id FROM "Webhook" WHERE "userId" = $1 AND "subscriberUrl" = $2 LIMIT 1',
    [userId, subscriberUrl],
  );

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE "Webhook"
       SET active = true,
           secret = $1,
           "eventTriggers" = $2::"WebhookTriggerEvents"[]
       WHERE id = $3`,
      [webhookSecret, CALCOM_WEBHOOK_EVENTS, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }

  const webhookId = randomUUID();
  await db.query(
    `INSERT INTO "Webhook" (id, "userId", "subscriberUrl", active, "eventTriggers", secret)
     VALUES ($1, $2, $3, true, $4::"WebhookTriggerEvents"[], $5)`,
    [webhookId, userId, subscriberUrl, CALCOM_WEBHOOK_EVENTS, webhookSecret],
  );
  return webhookId;
}

async function ensureCalcomApiKey(db, { tenantId, userId, providedApiKey }) {
  const apiKey = (providedApiKey || '').trim() || `cal_auto_${randomBytes(24).toString('hex')}`;

  await db.query(
    `INSERT INTO "ApiKey" (id, "userId", note, "hashedKey")
     VALUES ($1, $2, $3, encode(digest($4, 'sha256'), 'hex'))
     ON CONFLICT ("hashedKey") DO NOTHING`,
    [
      `aisha-auto-${tenantId.slice(0, 8)}-${Date.now().toString(36)}`,
      userId,
      `AiSHA auto-provisioned key for tenant ${tenantId}`,
      apiKey,
    ],
  );

  return apiKey;
}

async function autoProvisionCalcom({
  supabaseClient,
  tenantId,
  req,
  integrationName,
  config,
  apiCredentials,
  metadata,
}) {
  const db = getCalcomDb();
  if (!db) {
    throw new Error('Cal.com database is not configured. Start scheduling services first.');
  }

  const tenantName = await getTenantName(supabaseClient, tenantId);
  const existingLink = String(config?.cal_link || '').trim();
  const [requestedUsernameRaw, requestedSlugRaw] = existingLink.split('/');
  const requestedUsername = slugify(requestedUsernameRaw);
  const requestedSlug =
    slugify(requestedSlugRaw) || `${slugify(tenantName) || 'tenant'}-${tenantId.slice(0, 6)}`;

  const user = await ensureCalcomUser(db, {
    tenantId,
    tenantName: integrationName || tenantName,
    requestedUserId: config?.calcom_user_id,
    requestedUsername,
  });

  const eventType = await ensureCalcomEventType(db, {
    userId: user.id,
    requestedSlug,
    requestedEventTypeId: config?.event_type_id,
  });

  const apiKey = await ensureCalcomApiKey(db, {
    tenantId,
    userId: user.id,
    providedApiKey: apiCredentials?.api_key,
  });

  const webhookSecret =
    (apiCredentials?.webhook_secret || '').trim() || `whsec_${randomBytes(24).toString('hex')}`;
  const subscriberUrl = `${resolveBackendBaseUrl(req)}/api/webhooks/calcom`;
  await ensureCalcomWebhook(db, {
    userId: user.id,
    subscriberUrl,
    webhookSecret,
  });

  return {
    config: {
      ...(config || {}),
      auto_provision: true,
      calcom_user_id: user.id,
      event_type_id: eventType.id,
      cal_link: `${user.username}/${eventType.slug}`,
    },
    api_credentials: {
      ...(apiCredentials || {}),
      api_key: apiKey,
      webhook_secret: webhookSecret,
    },
    metadata: {
      ...(metadata || {}),
      auto_provisioned_at: new Date().toISOString(),
      auto_provisioned_by: 'tenant-integrations-route',
    },
  };
}

/**
 * Resolve the effective tenant_id from authenticated context.
 * Priority: req.tenant.id (from validateTenantAccess) > query/body fallback.
 * Rejects mismatches when both are provided.
 */
function resolveTenantId(req) {
  const fromMiddleware = req.tenant?.id;
  const queryTenantId = req.query?.tenant_id;
  const bodyTenantId = req.body?.tenant_id;

  if (hasMultipleValues(queryTenantId) || hasMultipleValues(bodyTenantId)) {
    return { error: 'tenant_id must be a single value' };
  }

  const fromRequest = queryTenantId || bodyTenantId;

  // If middleware resolved a tenant, use it (authoritative)
  if (fromMiddleware) {
    // Reject if caller explicitly passed a different tenant_id
    if (fromRequest && fromRequest !== fromMiddleware) {
      return { error: 'tenant_id mismatch: you do not have access to the requested tenant' };
    }
    return { tenant_id: fromMiddleware };
  }

  // Fallback for service-role or dev-mode calls
  if (fromRequest) return { tenant_id: fromRequest };

  return { error: 'tenant_id is required' };
}

export default function createTenantIntegrationRoutes({
  supabaseClient = supabase,
  validateTenantAccessMw = validateTenantAccess,
} = {}) {
  const router = express.Router();

  // Apply tenant validation to all routes
  router.use(validateTenantAccessMw);

  // GET /api/tenantintegrations - List tenant integrations with filters
  router.get('/', async (req, res) => {
    try {
      // This endpoint feeds Settings pages that expect fresh JSON on every load.
      // Explicit no-store avoids conditional 304 responses with empty bodies.
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      if (
        hasMultipleValues(req.query?.integration_type) ||
        hasMultipleValues(req.query?.is_active)
      ) {
        return res.status(400).json({
          status: 'error',
          message: 'integration_type and is_active must be single values',
        });
      }

      const integration_type = asSingleString(req.query?.integration_type, 'integration_type');
      const is_active = asSingleString(req.query?.is_active, 'is_active');
      const { tenant_id, error: tenantError } = resolveTenantId(req);
      if (tenantError) {
        return res.status(400).json({ status: 'error', message: tenantError });
      }

      let query = supabaseClient
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false });

      if (integration_type) {
        query = query.eq('integration_type', integration_type);
      }

      if (is_active !== undefined) {
        query = query.eq('is_active', is_active === 'true');
      }

      const { data, error } = await query;

      if (error) throw error;

      res.json({ status: 'success', data: { tenantintegrations: data || [] } });
    } catch (error) {
      logger.error('Error fetching tenant integrations:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/tenantintegrations/:id - Get single tenant integration (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, error: tenantError } = resolveTenantId(req);
      if (tenantError) {
        return res.status(400).json({ status: 'error', message: tenantError });
      }

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { data, error } = await supabaseClient
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .limit(1)
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error fetching tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/tenantintegrations - Create new tenant integration
  router.post('/', async (req, res) => {
    try {
      const { integration_type, integration_name, is_active, api_credentials, config, metadata } =
        req.body;

      if (hasMultipleValues(integration_type) || hasMultipleValues(integration_name)) {
        return res.status(400).json({
          status: 'error',
          message: 'integration_type and integration_name must be single values',
        });
      }

      const { tenant_id, error: tenantError } = resolveTenantId(req);
      if (tenantError) {
        return res.status(400).json({ status: 'error', message: tenantError });
      }

      if (!integration_type) {
        return res.status(400).json({ status: 'error', message: 'integration_type is required' });
      }

      if (isCommunicationsProviderIntegration(integration_type)) {
        const validation = validateCommunicationsProviderConfig({
          tenant_id,
          config: config || {},
          api_credentials: api_credentials || {},
        });

        if (!validation.valid) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid communications provider configuration',
            errors: validation.errors,
          });
        }
      }

      let nextConfig = config || {};
      let nextApiCredentials = api_credentials || {};
      let nextMetadata = metadata || {};

      const shouldAutoProvisionCalcom =
        integration_type === 'calcom' &&
        (nextConfig.auto_provision === undefined || nextConfig.auto_provision === true);

      if (shouldAutoProvisionCalcom) {
        const provisioned = await autoProvisionCalcom({
          supabaseClient,
          tenantId: tenant_id,
          req,
          integrationName: integration_name,
          config: nextConfig,
          apiCredentials: nextApiCredentials,
          metadata: nextMetadata,
        });
        nextConfig = provisioned.config;
        nextApiCredentials = provisioned.api_credentials;
        nextMetadata = provisioned.metadata;
      }

      const { data, error } = await supabaseClient
        .from('tenant_integrations')
        .insert({
          tenant_id,
          integration_type,
          integration_name: integration_name || null,
          is_active: is_active !== undefined ? is_active : true,
          api_credentials: nextApiCredentials,
          config: nextConfig,
          metadata: nextMetadata,
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ status: 'success', data });
    } catch (error) {
      logger.error('Error creating tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/tenantintegrations/:id - Update tenant integration (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, error: tenantError } = resolveTenantId(req);
      if (tenantError) {
        return res.status(400).json({ status: 'error', message: tenantError });
      }
      const {
        integration_type,
        integration_name,
        is_active,
        api_credentials,
        config,
        metadata,
        sync_status,
        last_sync,
        error_message,
      } = req.body;

      if (hasMultipleValues(integration_type) || hasMultipleValues(integration_name)) {
        return res.status(400).json({
          status: 'error',
          message: 'integration_type and integration_name must be single values',
        });
      }

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      let existingIntegration = null;
      const requiresExistingIntegration =
        integration_type === undefined ||
        config !== undefined ||
        api_credentials !== undefined ||
        metadata !== undefined;

      if (requiresExistingIntegration) {
        const { data, error: existingError } = await supabaseClient
          .from('tenant_integrations')
          .select('integration_type, config, api_credentials, metadata')
          .eq('tenant_id', tenant_id)
          .eq('id', id)
          .limit(1)
          .single();

        if (existingError || !data) {
          return res.status(404).json({ status: 'error', message: 'Integration not found' });
        }

        existingIntegration = data;
      }

      const updateData = {};

      if (integration_type !== undefined) updateData.integration_type = integration_type;
      if (integration_name !== undefined) updateData.integration_name = integration_name;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (api_credentials !== undefined) updateData.api_credentials = api_credentials;
      if (config !== undefined) updateData.config = config;
      if (metadata !== undefined) updateData.metadata = metadata;
      if (sync_status !== undefined) updateData.sync_status = sync_status;
      if (last_sync !== undefined) updateData.last_sync = last_sync;
      if (error_message !== undefined) updateData.error_message = error_message;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No fields to update' });
      }

      updateData.updated_at = new Date().toISOString();

      const effectiveIntegrationType =
        integration_type || existingIntegration?.integration_type || null;

      const existingConfig = existingIntegration?.config || {};
      const existingApiCredentials = existingIntegration?.api_credentials || {};
      const existingMetadata = existingIntegration?.metadata || {};

      let nextConfig = config !== undefined ? { ...existingConfig, ...config } : existingConfig;
      let nextApiCredentials =
        api_credentials !== undefined
          ? { ...existingApiCredentials, ...api_credentials }
          : existingApiCredentials;
      let nextMetadata =
        metadata !== undefined ? { ...existingMetadata, ...metadata } : existingMetadata;

      const shouldAutoProvisionCalcom =
        effectiveIntegrationType === 'calcom' &&
        (nextConfig.auto_provision === true ||
          !nextConfig.calcom_user_id ||
          !nextConfig.event_type_id ||
          !nextApiCredentials.webhook_secret ||
          !nextApiCredentials.api_key);

      if (shouldAutoProvisionCalcom) {
        const provisioned = await autoProvisionCalcom({
          supabaseClient,
          tenantId: tenant_id,
          req,
          integrationName: integration_name || existingIntegration?.integration_name,
          config: nextConfig,
          apiCredentials: nextApiCredentials,
          metadata: nextMetadata,
        });
        nextConfig = provisioned.config;
        nextApiCredentials = provisioned.api_credentials;
        nextMetadata = provisioned.metadata;
      }

      if (config !== undefined || shouldAutoProvisionCalcom) updateData.config = nextConfig;
      if (api_credentials !== undefined || shouldAutoProvisionCalcom) {
        updateData.api_credentials = nextApiCredentials;
      }
      if (metadata !== undefined || shouldAutoProvisionCalcom) updateData.metadata = nextMetadata;

      if (isCommunicationsProviderIntegration(effectiveIntegrationType)) {
        const validation = validateCommunicationsProviderConfig({
          tenant_id,
          config: config || existingIntegration?.config || existingIntegration?.configuration || {},
          api_credentials: api_credentials || existingIntegration?.api_credentials || {},
        });

        if (!validation.valid) {
          return res.status(400).json({
            status: 'error',
            message: 'Invalid communications provider configuration',
            errors: validation.errors,
          });
        }
      }

      const { data, error } = await supabaseClient
        .from('tenant_integrations')
        .update(updateData)
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Error updating tenant integration row:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Integration not found' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error updating tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/tenantintegrations/:id - Delete tenant integration (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, error: tenantError } = resolveTenantId(req);
      if (tenantError) {
        return res.status(400).json({ status: 'error', message: tenantError });
      }

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { data, error } = await supabaseClient
        .from('tenant_integrations')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select()
        .single();

      if (error || !data) {
        return res
          .status(404)
          .json({ status: 'error', message: 'Integration not found for DELETE' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error deleting tenant integration:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
