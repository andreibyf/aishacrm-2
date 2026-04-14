/**
 * Phase 1: Resolve audience rows from CRM entities.
 */

function inferRequiredChannel(campaignType) {
  if (campaignType === 'email') return 'email';
  return 'phone';
}

function normalizeTargetType(targetType) {
  if (targetType === 'lead') return 'lead';
  if (targetType === 'source') return 'source';
  if (targetType === 'opportunity') return 'opportunity';
  return 'contact';
}

function buildBaseQueryForTarget(targetType) {
  if (targetType === 'lead') {
    return `
      SELECT
        l.id AS contact_id,
        TRIM(CONCAT(COALESCE(l.first_name, ''), ' ', COALESCE(l.last_name, ''))) AS contact_name,
        l.email,
        l.phone,
        l.company,
        COALESCE(to_jsonb(l)->>'status', '') AS status_text,
        COALESCE((to_jsonb(l)->>'updated_at')::timestamptz, (to_jsonb(l)->>'created_at')::timestamptz) AS last_touched_at
      FROM leads l
      WHERE l.tenant_id = $1
    `;
  }

  if (targetType === 'source') {
    return `
      SELECT
        s.id AS contact_id,
        COALESCE(NULLIF(s.contact_person, ''), s.source_name, s.company_name, 'Unknown') AS contact_name,
        COALESCE(s.contact_email, s.email) AS email,
        COALESCE(s.contact_phone, s.phone) AS phone,
        COALESCE(s.company_name, s.source_name) AS company,
        COALESCE(to_jsonb(s)->>'status', '') AS status_text,
        COALESCE((to_jsonb(s)->>'updated_at')::timestamptz, (to_jsonb(s)->>'created_at')::timestamptz) AS last_touched_at
      FROM bizdev_sources s
      WHERE s.tenant_id = $1
    `;
  }

  return `
    SELECT
      c.id AS contact_id,
      TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS contact_name,
      c.email,
      COALESCE(c.phone, c.mobile) AS phone,
      COALESCE(c.company, a.name, '') AS company,
      COALESCE(to_jsonb(c)->>'status', '') AS status_text,
      COALESCE((to_jsonb(c)->>'updated_at')::timestamptz, (to_jsonb(c)->>'created_at')::timestamptz) AS last_touched_at
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id
    WHERE c.tenant_id = $1
  `;
}

export async function resolveAudience(
  pgPool,
  { tenant_id, audience = {}, campaignType = 'email' },
) {
  if (!pgPool) throw new Error('pgPool is required');
  if (!tenant_id) throw new Error('tenant_id is required');

  const targetType = normalizeTargetType(audience.target_type);
  const requiredChannel = audience.required_channel || inferRequiredChannel(campaignType);
  const inactivityDays = Number.isFinite(Number(audience.inactivity_days))
    ? Number(audience.inactivity_days)
    : null;
  const temperature = audience.temperature ? String(audience.temperature).toLowerCase() : null;

  const effectiveTarget = targetType === 'opportunity' ? 'contact' : targetType;
  const baseQuery = buildBaseQueryForTarget(effectiveTarget);

  let query = `SELECT * FROM (${baseQuery}) audience_rows WHERE 1=1`;
  const params = [tenant_id];

  if (inactivityDays && inactivityDays > 0) {
    params.push(inactivityDays);
    query += `\n AND COALESCE(audience_rows.last_touched_at, NOW()) <= NOW() - ($${params.length}::int * INTERVAL '1 day')`;
  }

  if (temperature) {
    params.push(`%${temperature}%`);
    query += `\n AND audience_rows.status_text ILIKE $${params.length}`;
  }

  if (requiredChannel === 'phone') {
    query += `\n AND NULLIF(TRIM(COALESCE(audience_rows.phone, '')), '') IS NOT NULL`;
  } else {
    query += `\n AND NULLIF(TRIM(COALESCE(audience_rows.email, '')), '') IS NOT NULL`;
  }

  query += `\n ORDER BY audience_rows.last_touched_at ASC NULLS FIRST`;

  const result = await pgPool.query(query, params);

  return result.rows.map((row) => ({
    contact_id: row.contact_id,
    contact_name: row.contact_name || 'Unknown',
    email: row.email || null,
    phone: row.phone || null,
    company: row.company || null,
  }));
}

export default resolveAudience;
