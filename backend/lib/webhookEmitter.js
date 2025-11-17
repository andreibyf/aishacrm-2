import crypto from 'crypto';

/**
 * Webhook Emitter
 * Emits tenant-scoped webhook events to URLs stored in `webhook` table.
 * Events are optional and gated by env flag WEBHOOKS_ENABLED.
 *
 * Expected table columns: id, tenant_id, url, event_types (jsonb array), is_active, secret
 */
export async function emitTenantWebhooks(pgPool, tenant_id, eventType, payload = {}) {
  try {
    if (process.env.WEBHOOKS_ENABLED !== 'true') return { emitted: 0 };
    if (!tenant_id || !eventType) return { emitted: 0 };

    const sql = `
      SELECT url, secret
      FROM webhook
      WHERE tenant_id = $1
        AND is_active = TRUE
        AND (
          (event_types::jsonb ? $2) OR (event_types::jsonb ? '*')
        )
    `;
    const result = await pgPool.query(sql, [tenant_id, eventType]);
    const targets = result.rows || [];
    if (targets.length === 0) return { emitted: 0 };

    const body = JSON.stringify({
      event: eventType,
      tenant_id,
      payload,
      emitted_at: new Date().toISOString(),
    });

    const sendOne = async (t) => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (t.secret) {
          const sig = crypto.createHmac('sha256', t.secret).update(body).digest('hex');
          headers['X-Webhook-Signature'] = sig;
        }
        // Avoid throwing on individual failures; best-effort
        await fetch(t.url, { method: 'POST', headers, body }).catch(() => undefined);
      } catch { /* ignore */ }
    };

    await Promise.all(targets.map(sendOne));
    return { emitted: targets.length };
  } catch (err) {
    // Do not propagate failures; webhook delivery is non-blocking
    return { emitted: 0, error: err.message };
  }
}

export default { emitTenantWebhooks };
