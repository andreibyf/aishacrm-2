/**
 * PEP Routes — Natural Language Report Queries (Phase 3) + Saved Reports (Phase 4)
 *
 * POST   /api/pep/compile                — compile plain English to query_entity IR
 * POST   /api/pep/query                  — execute a compiled query_entity IR
 * GET    /api/pep/saved-reports          — list all saved reports for tenant
 * POST   /api/pep/saved-reports          — save a new report
 * DELETE /api/pep/saved-reports/:id      — delete a saved report
 * PATCH  /api/pep/saved-reports/:id/run  — record a run (increment count + timestamp)
 *
 * Read-only query execution. Tenant isolation enforced on every operation.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { authenticateRequest } from '../middleware/authenticate.js';
import { resolveQuery } from '../../pep/compiler/resolver.js';
import { emitQuery, buildConfirmationString } from '../../pep/compiler/emitter.js';
import { parseLLM } from '../../pep/compiler/llmParser.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
// Inline slug helper — avoids adding a new dependency
// No regex quantifiers on user-controlled data to prevent ReDoS (CodeQL)
function slugify(str) {
  let s = str.toLowerCase().trim();
  s = s.replace(/[^\w\s-]/g, ''); // strip non-word chars (anchored, no ambiguity)
  s = s.replace(/\s/g, '-'); // one space → one hyphen
  s = s.replace(/_/g, '-'); // one underscore → one hyphen
  // Collapse consecutive hyphens with a loop — avoids polynomial regex on '-' sequences
  while (s.includes('--')) s = s.replace('--', '-');
  // Trim leading/trailing hyphens without regex
  let start = 0;
  let end = s.length - 1;
  while (start <= end && s[start] === '-') start++;
  while (end >= start && s[end] === '-') end--;
  return s.slice(start, end + 1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CATALOGS_DIR = join(__dirname, '..', '..', 'pep', 'catalogs');

// Load catalogs once at module load time
const entityCatalog = parseYaml(readFileSync(join(CATALOGS_DIR, 'entity-catalog.yaml'), 'utf8'));

// ─── Query system prompt for Phase 3 LLM parse ───────────────────────────────

function buildQuerySystemPrompt() {
  const entityLines = (entityCatalog.entities || [])
    .filter((e) => Array.isArray(e.fields))
    .map((e) => {
      const fieldNames = e.fields.map((f) => f.name).join(', ');
      return `${e.id} (table: ${e.aisha_binding?.table}) — fields: ${fieldNames}`;
    });

  const viewLines = (entityCatalog.views || []).map((v) => {
    const colNames = v.columns.map((c) => c.name).join(', ');
    return `${v.id} — columns: ${colNames}`;
  });

  const relationshipSummary = `
bizdev_sources.account_id → accounts.id
leads.account_id → accounts.id
contacts.account_id → accounts.id
opportunities.account_id → accounts.id
opportunities.contact_id → contacts.id
opportunities.lead_id → leads.id
activities.related_id → polymorphic (related_to indicates entity type)
all entities.assigned_to → employees.id`.trim();

  return `You are a strict query parser for a CRM reporting system.

Your task: parse a plain English report request into a structured JSON query object.

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- If you cannot confidently parse the input, return: { "match": false, "reason": "<why>" }
- Never invent entities, fields, or operators not listed below.

OUTPUT SHAPE (on success):
{
  "match": true,
  "target": "<entity or view name>",
  "target_kind": "entity" | "view",
  "filters": [
    { "field": "<field>", "operator": "<operator>", "value": "<value>" }
  ],
  "sort": { "field": "<field>", "direction": "asc" | "desc" } | null,
  "limit": <number> | null
}

VALID ENTITIES AND FIELDS:
${entityLines.join('\n')}

VALID VIEWS:
${viewLines.join('\n')}

VALID OPERATORS: eq, neq, gt, gte, lt, lte, contains, in, is_null, is_not_null

DATE RELATIVE TOKENS (use these for date values, wrapped in double braces):
{{date: today}}, {{date: start_of_month}}, {{date: end_of_month}},
{{date: start_of_quarter}}, {{date: end_of_quarter}}, {{date: start_of_year}},
{{date: last_N_days}} where N is a number (e.g. {{date: last_30_days}})

EMPLOYEE NAMES: if a filter references a person's name for the assigned_to field,
use value format: "{{resolve_employee: <name>}}"

ENTITY RELATIONSHIPS:
${relationshipSummary}

Return { "match": false, "reason": "..." } if:
- No entity or view can be identified from the request
- A requested field does not exist on the identified entity
- The request is ambiguous between two entities and cannot be resolved
- The intent is clearly not a data retrieval request`;
}

// ─── Date token resolution ────────────────────────────────────────────────────

function resolveDateToken(token) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  const quarter = Math.floor(m / 3);
  const quarterStart = new Date(y, quarter * 3, 1);
  const quarterEnd = new Date(y, quarter * 3 + 3, 0, 23, 59, 59, 999);

  const map = {
    today: now.toISOString().split('T')[0],
    start_of_month: new Date(y, m, 1).toISOString().split('T')[0],
    end_of_month: new Date(y, m + 1, 0).toISOString().split('T')[0],
    start_of_quarter: quarterStart.toISOString().split('T')[0],
    end_of_quarter: quarterEnd.toISOString().split('T')[0],
    start_of_year: `${y}-01-01`,
  };

  if (map[token]) return map[token];

  // last_N_days
  const lastNMatch = token.match(/^last_(\d+)_days$/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1], 10);
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  return null; // unresolvable token
}

function resolveFilterValue(value, tenantId, supabase) {
  if (typeof value !== 'string') return { resolved: true, value };

  // Date token
  const dateMatch = value.match(/^{{date:\s*(.+?)}}$/);
  if (dateMatch) {
    const resolved = resolveDateToken(dateMatch[1].trim());
    if (!resolved) {
      return { resolved: false, reason: `Unknown date token: ${value}` };
    }
    return { resolved: true, value: resolved };
  }

  // Employee token — deferred (needs async lookup, handled separately)
  if (value.startsWith('{{resolve_employee:')) {
    return { resolved: true, value, needsEmployeeLookup: true };
  }

  return { resolved: true, value };
}

// ─── Employee name resolution (async) ────────────────────────────────────────

async function resolveEmployeeToken(token, tenantId, supabase) {
  // token = "{{resolve_employee: James}}"
  const nameMatch = token.match(/^{{resolve_employee:\s*(.+?)}}$/);
  if (!nameMatch) return { resolved: false, reason: `Invalid employee token: ${token}` };

  const name = nameMatch[1].trim();
  const parts = name.split(/\s+/);

  let query = supabase
    .from('employees')
    .select('id, first_name, last_name, full_name')
    .eq('tenant_id', tenantId)
    .limit(5);

  if (parts.length === 1) {
    // Single name — search first or last
    query = query.or(`first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[0]}%`);
  } else {
    // Two-part name
    query = query.ilike('full_name', `%${name}%`);
  }

  const { data, error } = await query;

  if (error) {
    logger.warn({ err: error }, '[PEP] Employee lookup failed');
    return { resolved: false, reason: `Employee lookup failed: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { resolved: false, reason: `Could not find employee: ${name}` };
  }

  if (data.length > 1) {
    const names = data.map((e) => `${e.first_name} ${e.last_name}`).join(', ');
    return {
      resolved: false,
      reason: `Ambiguous employee name "${name}" — matches: ${names}. Please be more specific.`,
    };
  }

  return { resolved: true, value: data[0].id };
}

// ─── Supabase operator mapping ────────────────────────────────────────────────

function applyFilter(query, filter) {
  const { field, operator, value } = filter;
  switch (operator) {
    case 'eq':
      return query.eq(field, value);
    case 'neq':
      return query.neq(field, value);
    case 'gt':
      return query.gt(field, value);
    case 'gte':
      return query.gte(field, value);
    case 'lt':
      return query.lt(field, value);
    case 'lte':
      return query.lte(field, value);
    case 'contains':
      return query.ilike(field, `%${value}%`);
    case 'in':
      return query.in(field, Array.isArray(value) ? value : [value]);
    case 'is_null':
      return query.is(field, null);
    case 'is_not_null':
      return query.not(field, 'is', null);
    default:
      return query;
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export default function createPepRoutes(_pgPool) {
  const router = express.Router();

  router.use(authenticateRequest);

  // ── POST /api/pep/compile ─────────────────────────────────────────────────
  router.post('/compile', async (req, res) => {
    const { source, tenant_id } = req.body;

    if (!source || typeof source !== 'string' || !source.trim()) {
      return res.status(400).json({ status: 'error', message: 'Missing required field: source' });
    }
    if (!tenant_id) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Missing required field: tenant_id' });
    }

    try {
      // Build the Phase 3 query system prompt and pass it via context
      const systemPrompt = buildQuerySystemPrompt();

      // Use the LLM parser with the query-oriented system prompt
      const parsed = await parseLLM(
        source,
        { entity_catalog: entityCatalog, capability_catalog: {} },
        systemPrompt,
      );

      if (!parsed.match) {
        return res.status(200).json({
          status: 'clarification_required',
          reason: parsed.reason || 'Could not parse your query. Please rephrase.',
        });
      }

      // parsed from Phase 3 LLM returns query shape directly (target, filters, sort, limit)
      // not CBE shape (trigger, action, fallback)
      const queryFrame = {
        target: parsed.target,
        target_kind: parsed.target_kind,
        filters: parsed.filters || [],
        sort: parsed.sort || null,
        limit: parsed.limit || null,
      };

      const resolved = resolveQuery(queryFrame, entityCatalog);
      if (!resolved.resolved) {
        return res.status(200).json({
          status: 'clarification_required',
          reason: resolved.reason,
        });
      }

      const { braid_ir, semantic_frame, plan, audit } = emitQuery(resolved, source);
      const confirmation = buildConfirmationString(resolved);

      return res.status(200).json({
        status: 'success',
        data: {
          ir: braid_ir.instructions[0], // the single query_entity IR node
          braid_ir,
          semantic_frame,
          plan,
          audit,
          confirmation,
          target: resolved.target,
          target_kind: resolved.target_kind,
        },
      });
    } catch (err) {
      logger.error({ err }, '[PEP] /compile error');
      return res.status(500).json({ status: 'error', message: 'Compile failed: ' + err.message });
    }
  });

  // ── POST /api/pep/query ───────────────────────────────────────────────────
  router.post('/query', async (req, res) => {
    const { ir, tenant_id } = req.body;

    if (!ir || typeof ir !== 'object') {
      return res.status(400).json({ status: 'error', message: 'Missing required field: ir' });
    }
    if (!tenant_id) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Missing required field: tenant_id' });
    }

    // Safety: reject anything that isn't a query_entity node
    if (ir.op !== 'query_entity') {
      return res.status(400).json({
        status: 'error',
        message: `Only query_entity IR nodes are accepted. Got: ${ir.op}`,
      });
    }

    const supabase = getSupabaseClient();

    try {
      // Resolve all filter values (date tokens + employee tokens)
      const resolvedFilters = [];
      for (const filter of ir.filters || []) {
        const valResult = resolveFilterValue(filter.value, tenant_id, supabase);
        if (!valResult.resolved) {
          return res.status(400).json({ status: 'error', message: valResult.reason });
        }

        let resolvedValue = valResult.value;

        // Employee token needs async lookup
        if (valResult.needsEmployeeLookup) {
          const empResult = await resolveEmployeeToken(filter.value, tenant_id, supabase);
          if (!empResult.resolved) {
            return res.status(400).json({ status: 'error', message: empResult.reason });
          }
          resolvedValue = empResult.value;
        }

        resolvedFilters.push({ ...filter, value: resolvedValue });
      }

      // Build the Supabase query
      // tenant_id is ALWAYS injected — cannot be overridden by IR
      let query = supabase
        .from(ir.table || ir.target)
        .select('*')
        .eq('tenant_id', tenant_id);

      // Apply resolved filters
      for (const filter of resolvedFilters) {
        query = applyFilter(query, filter);
      }

      // Apply sort
      if (ir.sort?.field) {
        query = query.order(ir.sort.field, { ascending: ir.sort.direction === 'asc' });
      }

      // Apply limit (default 100, max 500 — already clamped in resolveQuery but clamp again for safety)
      const limit = Math.min(Math.max(1, Number(ir.limit) || 100), 500);
      query = query.limit(limit);

      const { data, error, count } = await query;

      if (error) {
        logger.warn({ err: error, target: ir.target }, '[PEP] Query execution error');
        return res.status(500).json({
          status: 'error',
          message: `Query failed: ${error.message}`,
        });
      }

      return res.status(200).json({
        status: 'success',
        data: {
          rows: data || [],
          count: (data || []).length,
          target: ir.target,
          target_kind: ir.target_kind,
          executed_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      logger.error({ err }, '[PEP] /query error');
      return res
        .status(500)
        .json({ status: 'error', message: 'Query execution failed: ' + err.message });
    }
  });

  // ── GET /api/pep/saved-reports ──────────────────────────────────────────────
  router.get('/saved-reports', async (req, res) => {
    const tenantId = req.query.tenant_id;
    if (!tenantId) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Missing required query param: tenant_id' });
    }

    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase
        .from('pep_saved_reports')
        .select(
          'id, report_name, filename, plain_english, compiled_ir, run_count, last_run_at, created_by, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('report_name', { ascending: true });

      if (error) {
        logger.warn({ err: error }, '[PEP] saved-reports GET error');
        return res.status(500).json({ status: 'error', message: error.message });
      }

      return res.status(200).json({ status: 'success', data: data || [] });
    } catch (err) {
      logger.error({ err }, '[PEP] saved-reports GET exception');
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ── POST /api/pep/saved-reports ───────────────────────────────────────────────
  router.post('/saved-reports', async (req, res) => {
    const { tenant_id, report_name, plain_english, compiled_ir } = req.body;

    if (!tenant_id || !report_name || !plain_english || !compiled_ir) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: tenant_id, report_name, plain_english, compiled_ir',
      });
    }

    const created_by = req.user?.email || req.user?.id || 'unknown';
    const dateSuffix = new Date().toISOString().split('T')[0];
    const filename = `${slugify(report_name)}-${dateSuffix}`;

    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase
        .from('pep_saved_reports')
        .insert({
          tenant_id,
          report_name: report_name.trim(),
          filename,
          plain_english,
          compiled_ir,
          created_by,
        })
        .select('id, report_name, filename, created_by, created_at')
        .single();

      if (error) {
        // Unique constraint violation — report_name already exists for this tenant
        if (error.code === '23505') {
          return res.status(409).json({
            status: 'error',
            message: `A report named "${report_name}" already exists. Please choose a different name.`,
          });
        }
        logger.warn({ err: error }, '[PEP] saved-reports POST error');
        return res.status(500).json({ status: 'error', message: error.message });
      }

      return res.status(201).json({ status: 'success', data });
    } catch (err) {
      logger.error({ err }, '[PEP] saved-reports POST exception');
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ── DELETE /api/pep/saved-reports/:id ────────────────────────────────────────
  router.delete('/saved-reports/:id', async (req, res) => {
    const { id } = req.params;
    const tenantId = req.query.tenant_id;

    if (!tenantId) {
      return res
        .status(400)
        .json({ status: 'error', message: 'Missing required query param: tenant_id' });
    }

    const supabase = getSupabaseClient();
    try {
      const { error } = await supabase
        .from('pep_saved_reports')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId); // tenant isolation: can only delete own tenant's reports

      if (error) {
        logger.warn({ err: error }, '[PEP] saved-reports DELETE error');
        return res.status(500).json({ status: 'error', message: error.message });
      }

      return res.status(200).json({ status: 'success' });
    } catch (err) {
      logger.error({ err }, '[PEP] saved-reports DELETE exception');
      return res.status(500).json({ status: 'error', message: err.message });
    }
    try {
      // Use an atomic UPDATE to avoid lost increments under concurrent access
      const result = await _pgPool.query(
        `
        UPDATE pep_saved_reports
        SET run_count = COALESCE(run_count, 0) + 1,
            last_run_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2
        `,
        [id, tenant_id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ status: 'error', message: 'Saved report not found.' });
      }

      return res.status(200).json({ status: 'success' });
    } catch (err) {
      logger.warn({ err }, '[PEP] saved-reports PATCH/run error');
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
