/**
 * Dashboard Caching Strategy
 * 
 * Implements aggressive browser-side caching with optional refresh:
 * 1. On load: Show cached data instantly (if available)
 * 2. Background: Fetch fresh data asynchronously
 * 3. User: Can refresh manually for latest data
 * 
 * This makes Dashboard feel instant while keeping data fresh on demand.
 */

const DASHBOARD_CACHE_KEY = (tenantId, includeTestData) => 
  `dashboard::v1::tenant=${tenantId}::testData=${includeTestData}`;

const DASHBOARD_CACHE_META_KEY = (tenantId, includeTestData) =>
  `dashboard::v1::meta::tenant=${tenantId}::testData=${includeTestData}`;

/**
 * Get dashboard data from browser cache
 * Returns null if not cached or expired
 */
export function getCachedDashboardData(tenantId, includeTestData = true) {
  try {
    const cacheKey = DASHBOARD_CACHE_KEY(tenantId, includeTestData);
    const metaKey = DASHBOARD_CACHE_META_KEY(tenantId, includeTestData);
    
    const data = localStorage.getItem(cacheKey);
    const meta = localStorage.getItem(metaKey);
    
    if (!data || !meta) return null;
    
    const metadata = JSON.parse(meta);
    const now = Date.now();
    
    // Return data regardless of age (let UI decide if it's stale)
    // Frontend can show "Cached at X" timestamp
    return {
      data: JSON.parse(data),
      cached: true,
      cachedAt: metadata.cachedAt,
      isStale: now - metadata.cachedAt > 5 * 60 * 1000, // > 5 minutes old
    };
  } catch (e) {
    console.warn('[Dashboard] Cache read error:', e.message);
    return null;
  }
}

/**
 * Save dashboard data to browser cache
 */
export function cacheDashboardData(tenantId, includeTestData, data) {
  try {
    const cacheKey = DASHBOARD_CACHE_KEY(tenantId, includeTestData);
    const metaKey = DASHBOARD_CACHE_META_KEY(tenantId, includeTestData);
    
    const metadata = {
      cachedAt: Date.now(),
      version: 1,
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(metaKey, JSON.stringify(metadata));
  } catch (e) {
    console.warn('[Dashboard] Cache write error:', e.message);
  }
}

/**
 * Clear dashboard cache for a tenant
 */
export function clearDashboardCache(tenantId, includeTestData = true) {
  try {
    const cacheKey = DASHBOARD_CACHE_KEY(tenantId, includeTestData);
    const metaKey = DASHBOARD_CACHE_META_KEY(tenantId, includeTestData);
    
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(metaKey);
  } catch (e) {
    console.warn('[Dashboard] Cache clear error:', e.message);
  }
}

/**
 * Clear ALL dashboard caches
 */
export function clearAllDashboardCaches() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('dashboard::')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('[Dashboard] Cache clear all error:', e.message);
  }
}
