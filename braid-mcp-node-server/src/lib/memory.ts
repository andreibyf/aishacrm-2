import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connected = false;

const DEFAULT_SESSION_TTL = 3600; // 1 hour
const DEFAULT_EVENT_TTL = 86400; // 24 hours
const DEFAULT_PREFS_TTL = 3600; // 1 hour

export async function initMemory(redisUrl = process.env.REDIS_URL): Promise<RedisClientType | null> {
  if (client) return client;
  if (!redisUrl) {
    console.warn('[MCP Memory] REDIS_URL not set; memory disabled');
    return null;
  }
  try {
    client = createClient({ url: redisUrl });
    client.on('error', (err: any) => {
      console.error('[MCP Memory] Redis error:', err?.message || err);
      connected = false;
    });
    client.on('connect', () => {
      connected = true;
      console.log('[MCP Memory] Connected to Redis');
    });
    await client.connect();
    return client;
  } catch (e: any) {
    console.error('[MCP Memory] Failed to connect:', e?.message || String(e));
    client = null;
    return null;
  }
}

export function isMemoryAvailable(): boolean {
  return !!client && connected;
}

function sessionKey(tenantId: string, userId: string, sessionId: string) {
  return `agent:session:${tenantId}:${userId}:${sessionId}`;
}
function eventsKey(tenantId: string, userId: string, sessionId: string) {
  return `agent:events:${tenantId}:${userId}:${sessionId}`;
}
function prefsKey(tenantId: string, userId: string) {
  return `agent:prefs:${tenantId}:${userId}`;
}
function navKey(tenantId: string, userId: string) {
  return `agent:nav:${tenantId}:${userId}`;
}

export async function saveSession(tenantId: string, userId: string, sessionId: string, data: any, ttlSeconds = DEFAULT_SESSION_TTL): Promise<boolean> {
  if (!client) return false;
  const payload = { ...data, tenantId, userId, sessionId, updatedAt: new Date().toISOString() };
  try {
    await client.setEx(sessionKey(tenantId, userId, sessionId), ttlSeconds, JSON.stringify(payload));
    return true;
  } catch (e: any) {
    console.error('[MCP Memory] saveSession error:', e?.message || String(e));
    return false;
  }
}

export async function appendEvent(tenantId: string, userId: string, sessionId: string, event: any): Promise<boolean> {
  if (!client) return false;
  const payload = { ...event, timestamp: new Date().toISOString(), tenantId, userId, sessionId };
  try {
    const key = eventsKey(tenantId, userId, sessionId);
    await client.rPush(key, JSON.stringify(payload));
    await client.expire(key, DEFAULT_EVENT_TTL);
    return true;
  } catch (e: any) {
    console.error('[MCP Memory] appendEvent error:', e?.message || String(e));
    return false;
  }
}

export async function getEvents(tenantId: string, userId: string, sessionId: string, limit = 50): Promise<any[]> {
  if (!client) return [];
  try {
    const key = eventsKey(tenantId, userId, sessionId);
    const raw = await client.lRange(key, -limit, -1);
    return raw.map((s: string) => JSON.parse(s));
  } catch (e: any) {
    console.error('[MCP Memory] getEvents error:', e?.message || String(e));
    return [];
  }
}

export async function getStatus() {
  if (!client) return { available: false };
  try {
    const memory = await client.info('memory');
    const stats = await client.info('stats');
    return { available: true, connected, memory, stats };
  } catch (e: any) {
    return { available: true, connected, error: e?.message || String(e) };
  }
}

// Preferences
export async function cachePreferences(tenantId: string, userId: string, prefs: any, ttlSeconds = DEFAULT_PREFS_TTL): Promise<boolean> {
  if (!client) return false;
  try {
    await client.setEx(prefsKey(tenantId, userId), ttlSeconds, JSON.stringify(prefs));
    return true;
  } catch (e: any) {
    console.error('[MCP Memory] cachePreferences error:', e?.message || String(e));
    return false;
  }
}

export async function getPreferences(tenantId: string, userId: string): Promise<any | null> {
  if (!client) return null;
  try {
    const s = await client.get(prefsKey(tenantId, userId));
    return s ? JSON.parse(s) : null;
  } catch (e: any) {
    console.error('[MCP Memory] getPreferences error:', e?.message || String(e));
    return null;
  }
}

export async function deletePreferences(tenantId: string, userId: string): Promise<boolean> {
  if (!client) return false;
  try {
    await client.del(prefsKey(tenantId, userId));
    return true;
  } catch (e: any) {
    console.error('[MCP Memory] deletePreferences error:', e?.message || String(e));
    return false;
  }
}

// Navigation
export async function saveNavigation(tenantId: string, userId: string, nav: any, ttlSeconds = DEFAULT_PREFS_TTL): Promise<boolean> {
  if (!client) return false;
  try {
    await client.setEx(navKey(tenantId, userId), ttlSeconds, JSON.stringify(nav));
    return true;
  } catch (e: any) {
    console.error('[MCP Memory] saveNavigation error:', e?.message || String(e));
    return false;
  }
}

export async function getNavigation(tenantId: string, userId: string): Promise<any | null> {
  if (!client) return null;
  try {
    const s = await client.get(navKey(tenantId, userId));
    return s ? JSON.parse(s) : null;
  } catch (e: any) {
    console.error('[MCP Memory] getNavigation error:', e?.message || String(e));
    return null;
  }
}
