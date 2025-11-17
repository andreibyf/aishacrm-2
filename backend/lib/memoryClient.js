/**
 * Memory Client - Ephemeral session/event storage using Redis/Valkey
 * 
 * Architecture:
 * - Redis/Valkey: Fast ephemeral storage with TTL (sessions, events, cache)
 * - Supabase: Permanent archive for important sessions/memories
 * 
 * Key Patterns:
 * - agent:session:{tenantId}:{userId}:{sessionId} - Active agent session data
 * - agent:events:{tenantId}:{userId}:{sessionId} - Event stream (list)
 * - agent:prefs:{tenantId}:{userId} - User preferences cache
 * - agent:nav:{tenantId}:{userId} - Navigation state cache
 */

import { createClient } from 'redis';

let redisClient = null;
let isConnected = false;

const DEFAULT_SESSION_TTL = 3600; // 1 hour
const DEFAULT_EVENT_TTL = 86400; // 24 hours
const DEFAULT_PREFS_TTL = 3600; // 1 hour

/**
 * Initialize Redis client
 */
export async function initMemoryClient(redisUrl = process.env.REDIS_URL) {
  if (redisClient) return redisClient;
  
  if (!redisUrl) {
    console.warn('[MemoryClient] REDIS_URL not set, memory features disabled');
    return null;
  }

  try {
    redisClient = createClient({ url: redisUrl });
    
    redisClient.on('error', (err) => {
      console.error('[MemoryClient] Redis connection error:', err.message);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('[MemoryClient] Connected to Redis');
      isConnected = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('[MemoryClient] Reconnecting to Redis...');
    });

    await redisClient.connect();
    console.log('✓ Memory client initialized');
    return redisClient;
  } catch (error) {
    console.error('[MemoryClient] Failed to initialize:', error.message);
    redisClient = null;
    return null;
  }
}

/**
 * Check if memory client is available
 */
export function isMemoryAvailable() {
  return redisClient !== null && isConnected;
}

/**
 * Get Redis client instance
 */
export function getMemoryClient() {
  if (!isMemoryAvailable()) {
    throw new Error('Memory client not initialized or not connected');
  }
  return redisClient;
}

// ============================================================================
// Agent Session Management
// ============================================================================

/**
 * Save agent session data
 */
export async function saveAgentSession(tenantId, userId, sessionId, data, ttlSeconds = DEFAULT_SESSION_TTL) {
  if (!isMemoryAvailable()) return false;
  
  try {
    const key = `agent:session:${tenantId}:${userId}:${sessionId}`;
    const payload = {
      ...data,
      tenantId,
      userId,
      sessionId,
      updatedAt: new Date().toISOString()
    };
    
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to save session:', error.message);
    return false;
  }
}

/**
 * Get agent session data
 */
export async function getAgentSession(tenantId, userId, sessionId) {
  if (!isMemoryAvailable()) return null;
  
  try {
    const key = `agent:session:${tenantId}:${userId}:${sessionId}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[MemoryClient] Failed to get session:', error.message);
    return null;
  }
}

/**
 * Delete agent session
 */
export async function deleteAgentSession(tenantId, userId, sessionId) {
  if (!isMemoryAvailable()) return false;
  
  try {
    const key = `agent:session:${tenantId}:${userId}:${sessionId}`;
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to delete session:', error.message);
    return false;
  }
}

/**
 * List all active sessions for a user
 */
export async function listUserSessions(tenantId, userId) {
  if (!isMemoryAvailable()) return [];
  
  try {
    const pattern = `agent:session:${tenantId}:${userId}:*`;
    const keys = await redisClient.keys(pattern);
    
    if (keys.length === 0) return [];
    
    const sessions = [];
    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        sessions.push(JSON.parse(data));
      }
    }
    
    return sessions;
  } catch (error) {
    console.error('[MemoryClient] Failed to list sessions:', error.message);
    return [];
  }
}

// ============================================================================
// Event Stream Management
// ============================================================================

/**
 * Append event to session stream
 */
export async function appendEvent(tenantId, userId, sessionId, event) {
  if (!isMemoryAvailable()) return false;
  
  try {
    const key = `agent:events:${tenantId}:${userId}:${sessionId}`;
    const payload = {
      ...event,
      timestamp: new Date().toISOString(),
      tenantId,
      userId,
      sessionId
    };
    
    await redisClient.rPush(key, JSON.stringify(payload));
    await redisClient.expire(key, DEFAULT_EVENT_TTL);
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to append event:', error.message);
    return false;
  }
}

/**
 * Get events for a session
 */
export async function getSessionEvents(tenantId, userId, sessionId, limit = 100) {
  if (!isMemoryAvailable()) return [];
  
  try {
    const key = `agent:events:${tenantId}:${userId}:${sessionId}`;
    const events = await redisClient.lRange(key, -limit, -1);
    return events.map(e => JSON.parse(e));
  } catch (error) {
    console.error('[MemoryClient] Failed to get session events:', error.message);
    return [];
  }
}

/**
 * Get recent events for a user across all sessions
 */
export async function getRecentEvents(tenantId, userId, limit = 50) {
  if (!isMemoryAvailable()) return [];
  
  try {
    const pattern = `agent:events:${tenantId}:${userId}:*`;
    const keys = await redisClient.keys(pattern);
    
    if (keys.length === 0) return [];
    
    const allEvents = [];
    for (const key of keys) {
      const events = await redisClient.lRange(key, 0, -1);
      allEvents.push(...events.map(e => JSON.parse(e)));
    }
    
    // Sort by timestamp descending
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return allEvents.slice(0, limit);
  } catch (error) {
    console.error('[MemoryClient] Failed to get recent events:', error.message);
    return [];
  }
}

// ============================================================================
// Preference Caching
// ============================================================================

/**
 * Cache user preferences
 */
export async function cacheUserPreferences(tenantId, userId, preferences, ttlSeconds = DEFAULT_PREFS_TTL) {
  if (!isMemoryAvailable()) return false;
  
  try {
    const key = `agent:prefs:${tenantId}:${userId}`;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(preferences));
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to cache preferences:', error.message);
    return false;
  }
}

/**
 * Get cached user preferences
 */
export async function getCachedPreferences(tenantId, userId) {
  if (!isMemoryAvailable()) return null;
  
  try {
    const key = `agent:prefs:${tenantId}:${userId}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[MemoryClient] Failed to get cached preferences:', error.message);
    return null;
  }
}

/**
 * Invalidate user preferences cache
 */
export async function invalidatePreferencesCache(tenantId, userId) {
  if (!isMemoryAvailable()) return false;
  
  try {
    const key = `agent:prefs:${tenantId}:${userId}`;
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to invalidate cache:', error.message);
    return false;
  }
}

// ============================================================================
// Navigation State Caching
// ============================================================================

/**
 * Save navigation state for quick dashboard loading
 */
export async function saveNavigationState(tenantId, userId, navState, ttlSeconds = DEFAULT_PREFS_TTL) {
  if (!isMemoryAvailable()) return false;
  
  try {
    const key = `agent:nav:${tenantId}:${userId}`;
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(navState));
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to save navigation state:', error.message);
    return false;
  }
}

/**
 * Get cached navigation state
 */
export async function getNavigationState(tenantId, userId) {
  if (!isMemoryAvailable()) return null;
  
  try {
    const key = `agent:nav:${tenantId}:${userId}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[MemoryClient] Failed to get navigation state:', error.message);
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get memory statistics
 */
export async function getMemoryStats() {
  if (!isMemoryAvailable()) {
    return { available: false };
  }
  
  try {
    const info = await redisClient.info('memory');
    const stats = await redisClient.info('stats');
    
    return {
      available: true,
      connected: isConnected,
      memory: info,
      stats
    };
  } catch (error) {
    console.error('[MemoryClient] Failed to get stats:', error.message);
    return { available: true, connected: isConnected, error: error.message };
  }
}

/**
 * Clear all memory data (use with caution!)
 */
export async function flushAllMemory() {
  if (!isMemoryAvailable()) return false;
  
  try {
    await redisClient.flushAll();
    console.log('[MemoryClient] Flushed all memory data');
    return true;
  } catch (error) {
    console.error('[MemoryClient] Failed to flush memory:', error.message);
    return false;
  }
}

/**
 * Gracefully disconnect
 */
export async function disconnectMemoryClient() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[MemoryClient] Disconnected');
    } catch (error) {
      console.error('[MemoryClient] Error during disconnect:', error.message);
    }
    redisClient = null;
    isConnected = false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  init: initMemoryClient,
  isAvailable: isMemoryAvailable,
  getClient: getMemoryClient,
  
  // Sessions
  saveAgentSession,
  getAgentSession,
  deleteAgentSession,
  listUserSessions,
  
  // Events
  appendEvent,
  getSessionEvents,
  getRecentEvents,
  
  // Preferences
  cacheUserPreferences,
  getCachedPreferences,
  invalidatePreferencesCache,
  
  // Navigation
  saveNavigationState,
  getNavigationState,
  
  // Utilities
  getMemoryStats,
  flushAllMemory,
  disconnect: disconnectMemoryClient
};
