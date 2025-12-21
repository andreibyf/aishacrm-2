import { initSupabaseDB, pool as supabasePool } from '../lib/supabase-db.js';

export async function initDatabase(app) {
  // Database connection using Supabase PostgREST API (avoids IPv6 issues)
  let pgPool = null;
  let dbConnectionType = "none";
  let ipv4FirstApplied = false;

  // Initialize diagnostics locals with defaults (updated after DB init)
  app.locals.ipv4FirstApplied = ipv4FirstApplied;
  app.locals.dbConnectionType = dbConnectionType;
  app.locals.resolvedDbIPv4 = null;
  
  const useSupabaseApi = (
    process.env.USE_SUPABASE_PROD === 'true' ||
    process.env.USE_SUPABASE_API === 'true' ||
    process.env.USE_SUPABASE_DEV === 'true'
  );

  app.locals.dbConfigPath = useSupabaseApi ? 'supabase_api' : 'none';

  // Initialize database using Supabase JS API (HTTP/REST, not direct PostgreSQL)
  if (useSupabaseApi) {
    // Use Supabase PostgREST API - works over HTTP, avoids IPv6 PostgreSQL issues
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    pgPool = supabasePool;
    dbConnectionType = "Supabase API";
    console.log("✓ Supabase PostgREST API initialized (HTTP-based, bypassing PostgreSQL IPv6)");

    // update diagnostics
    app.locals.dbConnectionType = dbConnectionType;
    app.locals.dbConfigPath = 'supabase_api';
  } else {
    console.warn("⚠ No database configured - set USE_SUPABASE_API=true (or USE_SUPABASE_PROD=true for legacy) with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  return { pgPool, dbConnectionType, ipv4FirstApplied };
}
