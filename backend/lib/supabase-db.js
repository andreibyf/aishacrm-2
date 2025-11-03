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
  let query = supabaseClient.from(table).select('*');
  
  // Parse WHERE with parameter substitution
  let paramIndex = 0;
  const whereMatch = sql.match(/where\s+(.+?)(?:\s+order\s+by|\s+limit|\s+offset|$)/i);
  if (whereMatch) {
    const wherePart = whereMatch[1];
    // Simple parsing: field = $1 AND field2 = $2
    const conditions = wherePart.split(/\s+and\s+/i);
    for (const cond of conditions) {
      const eqMatch = cond.match(/([a-z_]+)\s*=\s*\$(\d+)/i);
      if (eqMatch && paramIndex < params.length) {
        query = query.eq(eqMatch[1], params[paramIndex++]);
      }
    }
  }
  
  // Parse LIMIT
  const limitMatch = sql.match(/limit\s+(\d+)/i);
  if (limitMatch) {
    query = query.limit(parseInt(limitMatch[1]));
  }
  
  // Parse ORDER BY
  const orderMatch = sql.match(/order\s+by\s+([a-z_]+)(\s+desc|\s+asc)?/i);
  if (orderMatch) {
    const ascending = !orderMatch[2] || orderMatch[2].trim().toLowerCase() === 'asc';
    query = query.order(orderMatch[1], { ascending });
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
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
  
  // Parse SET clause
  const setMatch = sql.match(/set\s+(.+?)\s+where/i);
  if (!setMatch) throw new Error('UPDATE requires SET clause');
  
  // Parse WHERE
  const whereMatch = sql.match(/where\s+(.+)$/i);
  if (!whereMatch) throw new Error('UPDATE requires WHERE for safety');
  
  // Build update data
  const updateData = {};
  let paramIndex = 0;
  const setFields = setMatch[1].split(',');
  for (const field of setFields) {
    const fieldMatch = field.match(/([a-z_]+)\s*=\s*\$/i);
    if (fieldMatch && paramIndex < params.length) {
      updateData[fieldMatch[1]] = params[paramIndex++];
    }
  }
  
  // Build WHERE
  let query = supabaseClient.from(table).update(updateData);
  const whereConditions = whereMatch[1].split(/\s+and\s+/i);
  for (const cond of whereConditions) {
    const eqMatch = cond.match(/([a-z_]+)\s*=\s*\$/i);
    if (eqMatch && paramIndex < params.length) {
      query = query.eq(eqMatch[1], params[paramIndex++]);
    }
  }
  
  const { data, error } = await query.select();
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
  const whereMatch = sql.match(/where\s+(.+)$/i);
  if (!whereMatch) throw new Error('DELETE requires WHERE for safety');
  
  let query = supabaseClient.from(table).delete();
  let paramIndex = 0;
  const conditions = whereMatch[1].split(/\s+and\s+/i);
  for (const cond of conditions) {
    const eqMatch = cond.match(/([a-z_]+)\s*=\s*\$/i);
    if (eqMatch && paramIndex < params.length) {
      query = query.eq(eqMatch[1], params[paramIndex++]);
    }
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
