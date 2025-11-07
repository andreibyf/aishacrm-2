/**
 * Supabase Database Wrapper
 * Provides a PostgreSQL-like query interface using Supabase JS API
 * This avoids direct pooler connection issues while maintaining compatibility
 */

import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;
let postgresClient = null;

/**
 * Initialize Supabase client with direct Postgres connection fallback
 */
export function initSupabaseDB(url, serviceRoleKey) {
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase URL and Service Role Key are required');
  }
  
  supabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  });
  
  // DISABLED: Direct postgres connection still has pooler issues
  // Use Supabase API for all queries instead
  console.log('✓ Supabase API client initialized (using API for all queries)');
  
  /*
  // Also initialize direct postgres connection for raw SQL support
  // Use connection string from environment
  if (process.env.SUPABASE_DB_HOST) {
    const connectionString = `postgresql://${process.env.SUPABASE_DB_USER}:${process.env.SUPABASE_DB_PASSWORD}@${process.env.SUPABASE_DB_HOST}:${process.env.SUPABASE_DB_PORT || 5432}/${process.env.SUPABASE_DB_NAME || 'postgres'}`;
    
    try {
      postgresClient = postgres(connectionString, {
        ssl: 'require',
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      console.log('✓ Direct Postgres connection initialized for raw SQL');
    } catch (error) {
      console.warn('⚠ Could not initialize direct Postgres connection:', error.message);
      console.warn('→ Will use Supabase API for all queries');
    }
  }
  */
  
  console.log('✓ Supabase DB client initialized');
  return supabaseClient;
}

/**
 * Get Supabase client instance
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabaseDB first.');
  }
  return supabaseClient;
}

/**
 * PostgreSQL-compatible query interface
 * Mimics pg.Pool.query() for compatibility with existing code
 */
export async function query(sql, params = []) {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized');
  }

  try {
    // If we have direct postgres client, use it for raw SQL
    if (postgresClient) {
      const result = await postgresClient.unsafe(sql, params);
      return {
        rows: Array.isArray(result) ? result : [result],
        rowCount: Array.isArray(result) ? result.length : 1
      };
    }
    
    // Otherwise, use Supabase API with SQL parsing
    return await executeViaSupabaseAPI(sql, params);
    
  } catch (error) {
    // Convert errors to pg-like format
    const pgError = new Error(error.message || 'Database query failed');
    pgError.code = error.code || 'XX000';
    pgError.detail = error.details || error.hint || undefined;
    throw pgError;
  }
}

/**
 * Execute SQL via Supabase API (fallback when direct connection unavailable)
 */
async function executeViaSupabaseAPI(sql, params) {
  const sqlLower = sql.trim().toLowerCase();
  
  // Handle SELECT queries
  if (sqlLower.startsWith('select')) {
    return await handleSelectQuery(sql, params);
  }
  
  // Handle INSERT queries  
  if (sqlLower.startsWith('insert')) {
    return await handleInsertQuery(sql, params);
  }
  
  // Handle UPDATE queries
  if (sqlLower.startsWith('update')) {
    return await handleUpdateQuery(sql, params);
  }
  
  // Handle DELETE queries
  if (sqlLower.startsWith('delete')) {
    return await handleDeleteQuery(sql, params);
  }
  
  throw new Error(`Query type not supported via Supabase API: ${sql.substring(0, 50)}...`);
}

/**
 * Handle SELECT queries
 */
async function handleSelectQuery(sql, params) {
  // Robust clause extractor tolerant of newlines/extra whitespace
  // startPattern and endPatterns are regex source strings (without flags)
  const extractClause = (source, startPattern, endPatterns = []) => {
    const end = endPatterns.length ? '(?:' + endPatterns.join('|') + ')' : '$';
    const re = new RegExp(startPattern + '([\\s\\S]*?)' + end, 'i');
    const m = source.match(re);
    return m ? m[1].trim() : null;
  };
  // Extract table name
  const fromMatch = sql.match(/from\s+([a-z_]+)/i);
  if (!fromMatch) {
    // Handle simple queries like SELECT 1
    if (sql.match(/^select\s+\d+/i)) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    throw new Error('Could not parse table from SELECT');
  }
  const table = fromMatch[1];

  // Detect COUNT(*) queries and use head+count for efficient counting
  const isCountQuery = /select\s+count\s*\(\s*\*\s*\)/i.test(sql);
  let query = isCountQuery
    ? supabaseClient.from(table).select('*', { count: 'exact', head: true })
    : supabaseClient.from(table).select('*');
  
  // Parse WHERE with parameter substitution
  // Build WHERE conditions
  const wherePart = extractClause(sql, '\\bwhere\\b\\s+', ['\\border\\s+by\\b', '\\blimit\\b', '\\boffset\\b']);
  if (wherePart) {
    // Split on AND while preserving inner commas of IN lists
    const conditions = wherePart.split(/\s+and\s+/i).map(c => c.trim());
    console.log('[Supabase Adapter] WHERE conditions:', conditions);
    for (const cond of conditions) {
      // Handle OR groups by applying each supported predicate inside the group
      // subject ILIKE $n
      let g;
      // Generic ILIKE for simple columns: column ILIKE $n
      g = cond.match(/([a-z_]+)\s+ilike\s*\$(\d+)/i);
      if (g) {
        const col = g[1];
        const idx = parseInt(g[2], 10) - 1;
        query = query.ilike(col, params[idx]);
        // continue parsing for additional predicates within the same condition
      }

      // Case-insensitive equality: LOWER(column) = LOWER($n)
      // NOTE: This pattern is DEPRECATED - emails should be normalized to lowercase before queries
      // Kept for backward compatibility but prefer using exact match with pre-normalized values
      g = cond.match(/lower\(\s*"?([a-z_]+)"?\s*\)\s*=\s*lower\(\s*\$(\d+)\s*\)/i);
      if (g) {
        const col = g[1];
        const idx = parseInt(g[2], 10) - 1;
        // Use .eq() with lowercased value for exact case-insensitive match
        const value = typeof params[idx] === 'string' ? params[idx].toLowerCase() : params[idx];
        query = query.eq(col, value);
        continue;
      }
      const ilikeSubjectMatches = [...cond.matchAll(/subject\s+ilike\s*\$(\d+)/ig)];
      if (ilikeSubjectMatches.length > 0) {
        for (const mIlike of ilikeSubjectMatches) {
          const idx = parseInt(mIlike[1], 10) - 1;
          query = query.ilike('subject', params[idx]);
        }
        // continue parsing for additional predicates within the same condition
      }

      // JSON text equality: metadata->>'field' = $n
      g = cond.match(/metadata->>'([a-z_]+)'\s*=\s*\$(\d+)/i);
      if (g) {
        const field = g[1];
        const idx = parseInt(g[2], 10) - 1;
        query = query.filter(`metadata->>${field}`, 'eq', params[idx]);
        // don't continue; allow other simple conditions to be applied too
      }

      // JSON ILIKE: metadata->>'field' ILIKE $n
      g = cond.match(/metadata->>'([a-z_]+)'\s+ilike\s*\$(\d+)/i);
      if (g) {
        const field = g[1];
        const idx = parseInt(g[2], 10) - 1;
        query = query.filter(`metadata->>${field}`, 'ilike', params[idx]);
      }

      // JSON tags contains: (metadata->'tags')::jsonb @> $n::jsonb
      g = cond.match(/\(metadata->'tags'\)::jsonb\s*@>\s*\$(\d+)::jsonb/i);
      if (g) {
        const idx = parseInt(g[1], 10) - 1;
        let val = params[idx];
        try { val = typeof val === 'string' ? JSON.parse(val) : val; } catch { /* noop */ }
        // Use contains on the root metadata object for nested match
        query = query.contains('metadata', { tags: val });
      }

      // is_test_data {$ne: true}: COALESCE((metadata->>'is_test_data')::boolean, false) = false
      if (/coalesce\(\(metadata->>'is_test_data'\)::boolean,\s*false\)\s*=\s*false/i.test(cond)) {
        query = query.or('metadata->>is_test_data.is.null,metadata->>is_test_data.eq.false');
      }
      // is_test_data true: COALESCE((metadata->>'is_test_data')::boolean, false) = true
      if (/coalesce\(\(metadata->>'is_test_data'\)::boolean,\s*false\)\s*=\s*true/i.test(cond)) {
        query = query.filter('metadata->>is_test_data', 'eq', 'true');
      }

      // Due date range comparisons on metadata->>'due_date' via string compare (YYYY-MM-DD)
      g = cond.match(/to_date\(metadata->>'due_date','yyyy-mm-dd'\)\s*>=\s*to_date\(\$(\d+),'yyyy-mm-dd'\)/i);
      if (g) {
        const idx = parseInt(g[1], 10) - 1;
        query = query.gte('metadata->>due_date', params[idx]);
      }
      g = cond.match(/to_date\(metadata->>'due_date','yyyy-mm-dd'\)\s*<=\s*to_date\(\$(\d+),'yyyy-mm-dd'\)/i);
      if (g) {
        const idx = parseInt(g[1], 10) - 1;
        query = query.lte('metadata->>due_date', params[idx]);
      }
      // NOT IN: column NOT IN ($3,$4,...)
      let m = cond.match(/([a-z_]+)\s+not\s+in\s*\(([^)]+)\)/i);
      if (m) {
        const col = m[1];
        const placeholders = m[2].split(',').map(s => s.trim());
        const values = placeholders.map(ph => {
          const num = ph.replace('$', '');
          const idx = parseInt(num, 10) - 1;
          return params[idx];
        });
        // Chain neq for each value to emulate NOT IN
        for (const v of values) {
          query = query.neq(col, v);
        }
        continue;
      }

      // IN: column IN ($1,$2,...)
      m = cond.match(/([a-z_]+)\s+in\s*\(([^)]+)\)/i);
      if (m) {
        const col = m[1];
        const placeholders = m[2].split(',').map(s => s.trim());
        const values = placeholders.map(ph => {
          const num = ph.replace('$', '');
          const idx = parseInt(num, 10) - 1;
          return params[idx];
        });
        query = query.in(col, values);
        continue;
      }

      // Not equals: column != $n or <>
      m = cond.match(/([a-z_]+)\s*(?:!=|<>)\s*\$(\d+)/i);
      if (m) {
        const col = m[1];
        const idx = parseInt(m[2], 10) - 1;
        query = query.neq(col, params[idx]);
        continue;
      }

      // Equals: column = $n
      m = cond.match(/([a-z_]+)\s*=\s*\$(\d+)/i);
      if (m) {
        const col = m[1];
        const idx = parseInt(m[2], 10) - 1;
        console.log(`[Supabase Adapter] Applying .eq('${col}', '${params[idx]}')`);
        query = query.eq(col, params[idx]);
        continue;
      }
      // Unhandled condition types (JSON operators, functions) are ignored in API fallback
    }
  }
  
  // Parse LIMIT (supports numeric or parameterized $n)
  let limitVal = undefined;
  let mLimit = sql.match(/limit\s+(\d+)/i);
  if (mLimit) {
    limitVal = parseInt(mLimit[1], 10);
  } else {
    mLimit = sql.match(/limit\s+\$(\d+)/i);
    if (mLimit) {
      const idx = parseInt(mLimit[1], 10) - 1;
      limitVal = parseInt(params[idx], 10);
    }
  }
  // Parse OFFSET (supports numeric or parameterized $n) via range
  let offsetVal = 0;
  let mOffset = sql.match(/offset\s+(\d+)/i);
  if (mOffset) {
    offsetVal = parseInt(mOffset[1], 10) || 0;
  } else {
    mOffset = sql.match(/offset\s+\$(\d+)/i);
    if (mOffset) {
      const idx = parseInt(mOffset[1], 10) - 1;
      offsetVal = parseInt(params[idx], 10) || 0;
    }
  }
  if (!isCountQuery) {
    // Prefer range for pagination; avoid mixing limit + range
    const start = Math.max(0, offsetVal || 0);
    const to = (typeof limitVal === 'number' && limitVal > 0)
      ? (start + limitVal - 1)
      : (start + 999);
    query = query.range(start, to);
  }

  // Parse ORDER BY
  const orderSegment = extractClause(sql, '\\border\\s+by\\b\\s+', ['\\blimit\\b', '\\boffset\\b']);
  if (orderSegment) {
    const parts = orderSegment.trim().split(/\s+/);
    const col = parts[0]?.replace(/[,]/g, '');
    const dir = (parts[1] || 'asc').toLowerCase();
    if (col) {
      const ascending = dir !== 'desc';
      query = query.order(col, { ascending });
    }
  }
  
  const { data, error, count } = await query;
  if (error) throw error;
  
  if (isCountQuery) {
    // Return pg-like shape for COUNT(*)
    return { rows: [{ count: String(count ?? 0) }], rowCount: 1 };
  }
  return { rows: data || [], rowCount: data?.length || 0 };
}

/**
 * Handle INSERT queries
 */
async function handleInsertQuery(sql, params) {
  const tableMatch = sql.match(/insert\s+into\s+([a-z_]+)\s*\(([^)]+)\)/i);
  if (!tableMatch) throw new Error('Could not parse INSERT');
  
  const table = tableMatch[1];
  const columns = tableMatch[2].split(',').map(c => c.trim());
  
  const data = {};
  columns.forEach((col, i) => {
    if (i < params.length) data[col] = params[i];
  });
  // Sanitize common columns
  if (Object.prototype.hasOwnProperty.call(data, 'message')) {
    const v = data.message;
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      data.message = '(no message)';
    } else if (typeof v !== 'string') {
      try { data.message = JSON.stringify(v); } catch { data.message = String(v); }
    }
  }
    // Best-effort: parse JSON string payloads for JSON/JSONB columns like metadata
    if (typeof data.metadata === 'string') {
      try { data.metadata = JSON.parse(data.metadata); } catch { /* keep as-is */ }
    }
  
  const { data: result, error } = await supabaseClient
    .from(table)
    .insert(data)
    .select();
  
  if (error) throw error;
  return { rows: result || [], rowCount: result?.length || 0 };
}

/**
 * Handle UPDATE queries
 */
async function handleUpdateQuery(sql, params) {
  const tableMatch = sql.match(/update\s+([a-z_]+)/i);
  if (!tableMatch) throw new Error('Could not parse UPDATE');
  
  const table = tableMatch[1];
  // Robustly capture SET and WHERE parts allowing newlines / arbitrary whitespace.
  // Example patterns handled:
  // UPDATE table\nSET col = $1,\n    other = $2\nWHERE id = $3 RETURNING *
  // UPDATE table SET col=$1 WHERE id=$2
  const normalized = sql.replace(/\s+/g, ' '); // for simpler fallbacks if regex fails
  const setRegex = /update\s+[a-z_]+\s+set\s+([\s\S]+?)\s+where\s+/i;
  const setMatch = sql.match(setRegex);
  let setPart = setMatch ? setMatch[1].trim() : null;
  if (!setPart) {
    // Fallback: try normalized string
    const fallback = normalized.match(/update\s+[a-z_]+\s+set\s+(.+?)\s+where\s+/i);
    if (fallback) {
      // Use comma separation heuristic before WHERE
      setPart = fallback[1].trim();
    }
  }
  if (!setPart) throw new Error('UPDATE requires SET clause');

  // Capture WHERE (up to RETURNING / ORDER / LIMIT if present)
  let whereMatch = sql.match(/\swhere\s+([\s\S]+)/i);
  let wherePart = whereMatch ? whereMatch[1] : null;
  if (wherePart) {
    const terminatorIdx = [/\sreturning\s/i, /\sorder\s+/i, /\slimit\s+/i]
      .map(r => {
        const m = wherePart.match(r);
        return m ? wherePart.indexOf(m[0]) : -1;
      })
      .filter(i => i !== -1)
      .sort((a,b) => a-b)[0];
    if (terminatorIdx !== undefined) {
      if (terminatorIdx > -1) wherePart = wherePart.slice(0, terminatorIdx).trim();
    }
    wherePart = wherePart.trim();
  }
  if (!wherePart) throw new Error('UPDATE requires WHERE for safety');
  
  // Build update data
  const updateData = {};
  const setFields = setPart.split(',').map(f => f.trim());
  // (reserved) track missing columns if we later add telemetry – prefix with _ to satisfy lint
  const _missingColumns = [];
  for (const field of setFields) {
    const fieldMatch = field.match(/([a-z_]+)\s*=\s*\$(\d+)/i);
    if (!fieldMatch) continue;
    const colName = fieldMatch[1];
    const paramNum = parseInt(fieldMatch[2], 10) - 1; // 0-indexed
    if (paramNum < 0 || paramNum >= params.length) continue;
    // Optimistically assign; Supabase will error if truly invalid.
    updateData[colName] = params[paramNum];
  }
  // Parse JSON string payloads for JSON/JSONB columns when possible
  if (typeof updateData.metadata === 'string') {
    try { updateData.metadata = JSON.parse(updateData.metadata); } catch { /* noop */ }
  }
  
  // Build WHERE
  let query = supabaseClient.from(table).update(updateData);
  const whereConditions = wherePart.split(/\s+and\s+/i);
  for (const cond of whereConditions) {
    // Match: column = $N where N is a number
    const eqMatch = cond.trim().match(/([a-z_]+)\s*=\s*\$(\d+)/i);
    if (eqMatch) {
      const colName = eqMatch[1];
      const paramNum = parseInt(eqMatch[2], 10) - 1; // Convert to 0-indexed
      if (paramNum >= 0 && paramNum < params.length) {
        query = query.eq(colName, params[paramNum]);
      }
    }
  }
  
  const firstRes = await query.select();
  let { data, error } = firstRes;
  // Soft-handle stale schema cache for known added columns (e.g., status, due_date)
  if (error && ( /schema cache/i.test(error.message || '') || /could not find the '.+' column/i.test(error.message || '') )) {
    console.warn('[Supabase API] Stale schema cache detected – retrying update without newly added columns');
    const staleCols = ['status','due_date'];
    let removed = false;
    for (const c of staleCols) {
      if (c in updateData) {
        delete updateData[c];
        removed = true;
      }
    }
    if (removed) {
      let retry = supabaseClient.from(table).update(updateData);
      const whereConditions2 = wherePart.split(/\s+and\s+/i);
      for (const cond of whereConditions2) {
        const eqMatch = cond.trim().match(/([a-z_]+)\s*=\s*\$(\d+)/i);
        if (eqMatch) {
          const colName = eqMatch[1];
          const paramNum = parseInt(eqMatch[2], 10) - 1;
          if (paramNum >= 0 && paramNum < params.length) {
            retry = retry.eq(colName, params[paramNum]);
          }
        }
      }
      const retryRes = await retry.select();
      if (retryRes.error) throw retryRes.error;
      return { rows: retryRes.data || [], rowCount: retryRes.data?.length || 0 };
    }
  }
  if (error) throw error;
  
  return { rows: data || [], rowCount: data?.length || 0 };
}

/**
 * Handle DELETE queries
 */
async function handleDeleteQuery(sql, params) {
  const tableMatch = sql.match(/delete\s+from\s+([a-z_]+)/i);
  if (!tableMatch) throw new Error('Could not parse DELETE');
  
  const table = tableMatch[1];
  // Safe WHERE extractor
  const lower = sql.toLowerCase();
  const whereIdx = lower.indexOf(' where ');
  if (whereIdx === -1) throw new Error('DELETE requires WHERE for safety');
  const wherePart = sql.slice(whereIdx + 7).trim();
  
  let query = supabaseClient.from(table).delete();
  const conditions = wherePart.split(/\s+and\s+/i);
  let appliedFilters = 0;
  for (const rawCond of conditions) {
    const cond = rawCond.trim();
    // 1) Plain equality: column = $N
    let m = cond.match(/([a-z_]+)\s*=\s*\$(\d+)/i);
    if (m) {
      const colName = m[1];
      const paramNum = parseInt(m[2], 10) - 1; // Convert to 0-indexed
      if (paramNum >= 0 && paramNum < params.length) {
        query = query.eq(colName, params[paramNum]);
        appliedFilters++;
        continue;
      }
    }

    // 2) JSON text equality: metadata->>'field' = $N
    m = cond.match(/metadata->>'([a-z_]+)'\s*=\s*\$(\d+)/i);
    if (m) {
      const field = m[1];
      const paramNum = parseInt(m[2], 10) - 1;
      if (paramNum >= 0 && paramNum < params.length) {
        query = query.filter(`metadata->>${field}`, 'eq', params[paramNum]);
        appliedFilters++;
        continue;
      }
    }

    // 3) JSON boolean literal: (metadata->>'field')::boolean = true|false
    m = cond.match(/\(metadata->>'([a-z_]+)'\)::boolean\s*=\s*(true|false)/i);
    if (m) {
      const field = m[1];
      const boolStr = m[2].toLowerCase();
      query = query.filter(`metadata->>${field}`, 'eq', boolStr);
      appliedFilters++;
      continue;
    }

    // 4) Special cases using COALESCE for is_test_data
    if (/coalesce\(\(metadata->>'is_test_data'\)::boolean,\s*false\)\s*=\s*true/i.test(cond)) {
      query = query.filter('metadata->>is_test_data', 'eq', 'true');
      appliedFilters++;
      continue;
    }
    if (/coalesce\(\(metadata->>'is_test_data'\)::boolean,\s*false\)\s*=\s*false/i.test(cond)) {
      // Keep rows where is_test_data is null or false - represent as OR in Supabase
      query = query.or('metadata->>is_test_data.is.null,metadata->>is_test_data.eq.false');
      appliedFilters++;
      continue;
    }

    // 5) Time-based filter: created_at > NOW() - $N::INTERVAL (for bulk delete operations)
    m = cond.match(/([a-z_]+)\s*>\s*now\(\)\s*-\s*\$(\d+)::interval/i);
    if (m) {
      const colName = m[1];
      const paramNum = parseInt(m[2], 10) - 1;
      if (paramNum >= 0 && paramNum < params.length) {
        // Parse interval like "24 hours" or "7 days"
        const intervalStr = String(params[paramNum]);
        const intervalMatch = intervalStr.match(/^(\d+)\s+(hour|day|minute|week)s?$/i);
        if (intervalMatch) {
          const amount = parseInt(intervalMatch[1], 10);
          const unit = intervalMatch[2].toLowerCase();
          // Calculate timestamp: NOW - interval
          const now = new Date();
          let cutoffDate;
          switch (unit) {
            case 'minute':
              cutoffDate = new Date(now.getTime() - amount * 60 * 1000);
              break;
            case 'hour':
              cutoffDate = new Date(now.getTime() - amount * 60 * 60 * 1000);
              break;
            case 'day':
              cutoffDate = new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
              break;
            case 'week':
              cutoffDate = new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
              break;
            default:
              cutoffDate = now;
          }
          query = query.gt(colName, cutoffDate.toISOString());
          appliedFilters++;
          continue;
        }
      }
    }

    // 6) Time-based filter: created_at < NOW() - INTERVAL 'N days/hours' (for older_than filters)
    m = cond.match(/([a-z_]+)\s*<\s*now\(\)\s*-\s*interval\s*'(\d+)\s+(hour|day|minute|week)s?'/i);
    if (m) {
      const colName = m[1];
      const amount = parseInt(m[2], 10);
      const unit = m[3].toLowerCase();
      const now = new Date();
      let cutoffDate;
      switch (unit) {
        case 'minute':
          cutoffDate = new Date(now.getTime() - amount * 60 * 1000);
          break;
        case 'hour':
          cutoffDate = new Date(now.getTime() - amount * 60 * 60 * 1000);
          break;
        case 'day':
          cutoffDate = new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
          break;
        case 'week':
          cutoffDate = new Date(now.getTime() - amount * 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = now;
      }
      query = query.lt(colName, cutoffDate.toISOString());
      appliedFilters++;
      continue;
    }

    // 7) Simple 1=1 always-true condition (used for base WHERE clause)
    if (/^1\s*=\s*1$/i.test(cond)) {
      // Skip - this is just a placeholder for building dynamic WHERE clauses
      continue;
    }
  }

  // Prevent unsafe full-table deletes when we couldn't translate any filters
  if (appliedFilters === 0) {
    throw new Error('Unsafe DELETE without supported filters in API mode');
  }
  
  const { data, error } = await query.select();
  if (error) throw error;
  
  return { rows: data || [], rowCount: data?.length || 0 };
}

/**
 * Pool-compatible interface
 */
export const pool = {
  query,
  end: async () => {
    if (postgresClient) {
      await postgresClient.end();
    }
    console.log('Supabase/Postgres clients closed');
  }
};
