import { createClient, RedisClientType } from 'redis';
import { getErrorMessage } from './errorUtils';
import logger from '../lib/logger';

let client: RedisClientType | null = null;
let connected = false;

const DEFAULT_SESSION_TTL = 3600; // 1 hour
const DEFAULT_EVENT_TTL = 86400; // 24 hours
const DEFAULT_PREFS_TTL = 3600; // 1 hour

export async function initMemory(redisUrl = process.env.REDIS_URL): Promise<RedisClientType | null> {
  if (client) return client;
  if (!redisUrl) {
    logger.warn('[MCP Memory] REDIS_URL not set; memory disabled');
    return null;
  }
  try {
    client = createClient({ url: redisUrl });
    client.on('error', (err: unknown) => {
      logger.error(`[MCP Memory] Redis error: ${getErrorMessage(err)}`);
      connected = false;
    });
    client.on('connect', () => {
      connected = true;
      logger.debug('[MCP Memory] Connected to Redis');
    });
    await client.connect();
    return client;
  } catch (e: unknown) {
    logger.error(`[MCP Memory] Failed to connect: ${getErrorMessage(e)}`);
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
  } catch (e: unknown) {
    logger.error(`[MCP Memory] saveSession error: ${getErrorMessage(e)}`);
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
  } catch (e: unknown) {
    logger.error(`[MCP Memory] appendEvent error: ${getErrorMessage(e)}`);
    return false;
  }
}

export async function getEvents(tenantId: string, userId: string, sessionId: string, limit = 50): Promise<any[]> {
  if (!client) return [];
  try {
    const key = eventsKey(tenantId, userId, sessionId);
    const raw = await client.lRange(key, -limit, -1);
    return raw.map((s: string) => JSON.parse(s));
  } catch (e: unknown) {
    logger.error(`[MCP Memory] getEvents error: ${getErrorMessage(e)}`);
    return [];
  }
}

export async function getStatus() {
  if (!client) return { available: false };
  try {
    const memory = await client.info('memory');
    const stats = await client.info('stats');
    return { available: true, connected, memory, stats };
  } catch (e: unknown) {
    return { available: true, connected, error: getErrorMessage(e) };
  }
}

// Preferences
export async function cachePreferences(tenantId: string, userId: string, prefs: any, ttlSeconds = DEFAULT_PREFS_TTL): Promise<boolean> {
  if (!client) return false;
  try {
    await client.setEx(prefsKey(tenantId, userId), ttlSeconds, JSON.stringify(prefs));
    return true;
  } catch (e: unknown) {
    logger.error(`[MCP Memory] cachePreferences error: ${getErrorMessage(e)}`);
    return false;
  }
}

export async function getPreferences(tenantId: string, userId: string): Promise<any | null> {
  if (!client) return null;
  try {
    const s = await client.get(prefsKey(tenantId, userId));
    return s ? JSON.parse(s) : null;
  } catch (e: unknown) {
    logger.error(`[MCP Memory] getPreferences error: ${getErrorMessage(e)}`);
    return null;
  }
}

export async function deletePreferences(tenantId: string, userId: string): Promise<boolean> {
  if (!client) return false;
  try {
    await client.del(prefsKey(tenantId, userId));
    return true;
  } catch (e: unknown) {
    logger.error(`[MCP Memory] deletePreferences error: ${getErrorMessage(e)}`);
    return false;
  }
}

// Navigation
export async function saveNavigation(tenantId: string, userId: string, nav: any, ttlSeconds = DEFAULT_PREFS_TTL): Promise<boolean> {
  if (!client) return false;
  try {
    await client.setEx(navKey(tenantId, userId), ttlSeconds, JSON.stringify(nav));
    return true;
  } catch (e: unknown) {
    logger.error(`[MCP Memory] saveNavigation error: ${getErrorMessage(e)}`);
    return false;
  }
}

export async function getNavigation(tenantId: string, userId: string): Promise<any | null> {
  if (!client) return null;
  try {
    const s = await client.get(navKey(tenantId, userId));
    return s ? JSON.parse(s) : null;
  } catch (e: unknown) {
    logger.error(`[MCP Memory] getNavigation error: ${getErrorMessage(e)}`);
    return null;
  }
}
