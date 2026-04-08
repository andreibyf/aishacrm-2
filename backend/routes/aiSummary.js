import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { generateChatCompletion } from '../lib/aiEngine/llmClient.js';
import logger from '../lib/logger.js';

const router = express.Router();

const CACHE_TTL_HOURS = 24;

/**
 * Generate AI summary for a person/entity profile
 * POST /api/ai/summarize-person-profile
 * Body: { person_id, person_type, profile_data, tenant_id }
 */
router.post('/summarize-person-profile', async (req, res) => {
  try {
    const { person_id, person_type, profile_data, tenant_id } = req.body;

    if (!person_id || !person_type || !profile_data) {
      return res.status(400).json({
        error: 'Missing required fields: person_id, person_type, profile_data',
      });
    }

    const supabase = getSupabaseClient();

    // ── Cache check: return existing summary if < 24h old ──────────────────
    // SECURITY: Must scope by tenant_id to prevent cross-tenant data leaks
    const { data: existing } = await supabase
      .from('person_profile')
      .select('ai_summary, ai_summary_updated_at')
      .eq('person_id', person_id)
      .eq('tenant_id', req.tenant?.id || tenant_id)
      .maybeSingle();

    if (existing?.ai_summary && existing?.ai_summary_updated_at) {
      const ageMs = Date.now() - new Date(existing.ai_summary_updated_at).getTime();
      if (ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000) {
        const cached = Array.isArray(existing.ai_summary)
          ? existing.ai_summary.join(' ')
          : existing.ai_summary;
        logger.debug(
          `[AI Summary] Cache hit for ${person_id} (${Math.round(ageMs / 3600000)}h old)`,
        );
        return res.json({ ai_summary: cached, source: 'cache' });
      }
    }

    // ── Build context string ────────────────────────────────────────────────
    const context = buildProfileContext(profile_data, person_type);

    // ── Try LLM via unified AI engine ──────────────────────────────────────
    let ai_summary = null;
    let source = 'fallback';
    const provider = process.env.SUMMARY_LLM_PROVIDER || 'local';
    const model = process.env.SUMMARY_LLM_MODEL || 'llama3.2:3b';
    const temperature = parseFloat(process.env.SUMMARY_TEMPERATURE ?? '0.1');

    try {
      logger.debug(`[AI Summary] Generating via ${provider} model=${model} for ${person_id}`);
      const result = await generateChatCompletion({
        provider,
        model,
        maxTokens: 150,
        messages: [
          {
            role: 'system',
            content:
              'You are a CRM data summariser. Your job is to summarise ONLY the data you are given - ' +
              'do NOT infer, assume, or invent any information that is not explicitly present in the input. ' +
              'If a field is missing or empty, do not guess at it. ' +
              'If there are no activities or notes, do not mention engagement or interest. ' +
              'Write 2-3 factual sentences only. No bullet points, no headers. ' +
              'Stick strictly to: who the person is (name, title, company), their current status, ' +
              'and any concrete next action only if one is recorded in the data.',
          },
          {
            role: 'user',
            content: `Summarise this ${person_type} using only the data provided. Do not add context or assumptions:\n\n${context}`,
          },
        ],
        temperature,
        tenantId: req.tenant?.id || tenant_id || null,
      });

      const text = result.status === 'success' ? String(result.content || '').trim() : '';
      if (text && text.length > 20) {
        ai_summary = text;
        source = provider;
        logger.debug(`[AI Summary] Generated via ${source} for ${person_id}`);
      }
    } catch (llmErr) {
      logger.warn({ err: llmErr }, `[AI Summary] ${provider} failed, falling back to template`);
    }

    // ── Fallback: deterministic template ───────────────────────────────────
    if (!ai_summary) {
      ai_summary = generateFallbackSummary(profile_data, person_type);
      if (!ai_summary) {
        return res.status(400).json({ error: 'Could not generate AI summary' });
      }
    }

    // ── Persist to person_profile (upsert) ─────────────────────────────────
    const summaryValue = Array.isArray(ai_summary) ? ai_summary : [ai_summary];

    // SECURITY: Always use req.tenant.id if available (from middleware), fall back to body tenant_id
    const safeTenantId = req.tenant?.id || tenant_id;
    if (!safeTenantId) {
      return res.status(400).json({ error: 'Missing required field: tenant_id' });
    }

    // SECURITY: Verify existing row belongs to the same tenant before updating
    const { data: existingRow } = await supabase
      .from('person_profile')
      .select('tenant_id')
      .eq('person_id', person_id)
      .maybeSingle();

    if (existingRow && existingRow.tenant_id !== safeTenantId) {
      return res.status(403).json({ error: "Cannot modify another tenant's data" });
    }

    await supabase
      .from('person_profile')
      .upsert(
        {
          person_id,
          person_type,
          tenant_id: safeTenantId,
          ai_summary: summaryValue,
          ai_summary_updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id' },
      )
      .throwOnError();

    return res.json({ ai_summary, source });
  } catch (err) {
    logger.error('[AI Summary] Error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate AI summary', details: err?.message });
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildProfileContext(profile, personType) {
  const lines = [];

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  if (name) lines.push(`Name: ${name}`);
  if (profile.job_title) lines.push(`Title: ${profile.job_title}`);
  if (profile.account_name) lines.push(`Company: ${profile.account_name}`);
  if (profile.status) lines.push(`Status: ${profile.status}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);

  if (profile.last_activity_at) {
    const days = Math.floor((Date.now() - new Date(profile.last_activity_at).getTime()) / 86400000);
    lines.push(`Last activity: ${days} days ago`);
  }

  const oppCount = profile.open_opportunity_count || 0;
  if (oppCount > 0) lines.push(`Open opportunities: ${oppCount}`);

  if (profile.opportunity_stage?.length > 0) {
    lines.push(`Opportunity stages: ${profile.opportunity_stage.join(', ')}`);
  }

  if (profile.notes?.length > 0) {
    lines.push(`Recent notes (${profile.notes.length}):`);
    profile.notes.slice(0, 2).forEach((n) => {
      lines.push(`  - ${n.title}: ${String(n.content || '').substring(0, 80)}`);
    });
  }

  if (profile.activities?.length > 0) {
    const overdue = profile.activities.filter(
      (a) => a.status === 'overdue' || a.status === 'Overdue',
    );
    if (overdue.length) lines.push(`Overdue activities: ${overdue.length}`);
    lines.push(`Recent activities (${profile.activities.length} total):`);
    profile.activities.slice(0, 2).forEach((a) => {
      lines.push(`  - [${a.status}] ${a.subject}`);
    });
  }

  lines.push(`Entity type: ${personType}`);
  return lines.join('\n');
}

function generateFallbackSummary(profile, personType) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  const intro =
    [name, profile.job_title, profile.account_name ? `at ${profile.account_name}` : null]
      .filter(Boolean)
      .join(' ') || `${personType} profile`;

  const notes = [];

  const lastActivity = profile.last_activity_at ? new Date(profile.last_activity_at) : null;
  const daysSince = lastActivity
    ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
    : null;

  if (daysSince !== null) {
    if (daysSince > 30) notes.push(`No activity for ${daysSince} days — re-engagement needed`);
    else if (daysSince > 14)
      notes.push(`Last active ${daysSince} days ago — follow-up recommended`);
  }

  const overdue = (profile.activities || []).filter(
    (a) => a.status === 'overdue' || a.status === 'Overdue',
  );
  if (overdue.length) notes.push(`${overdue.length} overdue task(s) requiring attention`);

  const oppCount = profile.open_opportunity_count || 0;
  if (oppCount === 1) notes.push('1 open opportunity to advance');
  else if (oppCount > 1) notes.push(`${oppCount} open opportunities — prioritise next steps`);

  const statusMap = {
    cold: 'cold lead — initiate contact',
    warm: 'warm lead — timely follow-up advised',
    hot: 'hot lead — prioritise immediately',
  };
  const statusNote = statusMap[(profile.status || '').toLowerCase()];
  if (statusNote) notes.push(statusNote);

  return notes.length ? `${intro}. Key actions: ${notes.join('; ')}.` : intro;
}

export default router;
