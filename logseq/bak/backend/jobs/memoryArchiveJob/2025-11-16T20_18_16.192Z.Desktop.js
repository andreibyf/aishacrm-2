import { getMemoryClient } from "../lib/memoryClient.js";
import { getSupabaseClient, initSupabaseDB } from "../lib/supabase-db.js";

function parseSessionKey(key) {
  // agent:session:{tenantId}:{userId}:{sessionId}
  const parts = key.split(":");
  if (parts.length < 5) return null;
  return { tenantId: parts[2], userId: parts[3], sessionId: parts.slice(4).join(':') };
}

function eventsKey(tenantId, userId, sessionId) {
  return `agent:events:${tenantId}:${userId}:${sessionId}`;
}

function sessionKey(tenantId, userId, sessionId) {
  return `agent:session:${tenantId}:${userId}:${sessionId}`;
}

function shouldArchiveSession(sessionObj, events) {
  try {
    if (!sessionObj) return false;
    if (sessionObj.archive === true) return true;
    if (sessionObj.status && String(sessionObj.status).toLowerCase() === 'completed') return true;
    if (Array.isArray(events)) {
      return events.some(e => {
        const t = (e?.type || '').toLowerCase();
        return t === 'final' || t === 'summary' || t === 'decision' || t === 'end';
      });
    }
  } catch { /* ignore parse/shape errors and default to not archiving */ }
  return false;
}

export async function archiveSessionByIds(tenantId, userId, sessionId) {
  // Ensure supabase initialized (idempotent)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for archive');
  }
  try { initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); } catch { /* already initialized or failed; will throw later if unusable */ }
  const supa = getSupabaseClient();

  const redis = getMemoryClient();
  const sKey = sessionKey(tenantId, userId, sessionId);
  const eKey = eventsKey(tenantId, userId, sessionId);

  const raw = await redis.get(sKey);
  const session = raw ? JSON.parse(raw) : null;
  if (!session) {
    return { archived: false, reason: 'SESSION_NOT_FOUND' };
  }
  const eventStrings = await redis.lRange(eKey, 0, -1);
  const events = eventStrings.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

  // Upsert session archive
  const sessionRow = {
    tenant_id: tenantId,
    user_id: userId,
    session_id: sessionId,
    title: session.title || null,
    data: session,
  };
  const { error: sErr } = await supa.from('agent_sessions_archive').insert([sessionRow]);
  if (sErr) throw sErr;

  // Insert events in batches of 200
  if (events.length > 0) {
    const rows = events.map(ev => ({ tenant_id: tenantId, user_id: userId, session_id: sessionId, event: ev }));
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: eErr } = await supa.from('agent_events_archive').insert(chunk);
      if (eErr) throw eErr;
    }
  }

  return { archived: true, sessionEvents: events.length };
}

export async function scanAndArchive({ limit = 200 } = {}) {
  const redis = getMemoryClient();
  const keys = await redis.keys('agent:session:*');
  let scanned = 0;
  let archived = 0;
  const results = [];

  for (const key of keys.slice(0, limit)) {
    scanned++;
    const ids = parseSessionKey(key);
    if (!ids) continue;
    const raw = await redis.get(key);
    const session = raw ? JSON.parse(raw) : null;
    const eventsRaw = await redis.lRange(eventsKey(ids.tenantId, ids.userId, ids.sessionId), 0, -1);
    const events = eventsRaw.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

    if (shouldArchiveSession(session, events)) {
      const res = await archiveSessionByIds(ids.tenantId, ids.userId, ids.sessionId);
      archived += res.archived ? 1 : 0;
      results.push({ key, archived: res.archived });
    }
  }

  return { scanned, archived, sampled: results.slice(0, 10) };
}
