import { useState, useCallback, useEffect, useRef } from "react";

const NAV_ORDER_KEY_PREFIX = "aisha_crm_nav_order";
const SECONDARY_NAV_ORDER_KEY_PREFIX = "aisha_crm_secondary_nav_order";

/**
 * Build a tenant-scoped storage key
 * @param {string} prefix - The key prefix
 * @param {string|null} tenantId - The tenant ID (UUID or null)
 * @returns {string} The full storage key
 */
function buildStorageKey(prefix, tenantId) {
  if (tenantId) {
    return `${prefix}_${tenantId}`;
  }
  return prefix; // Fallback for global/no-tenant context
}

/**
 * Hook to manage navigation item order with database + localStorage persistence.
 * 
 * The order is stored in the user's permissions in the database so it persists
 * across sign-out/sign-in. localStorage is used as a cache for immediate access.
 * 
 * Priority: Database (user.permissions) > localStorage > default order
 * 
 * @param {Array} defaultItems - The default navigation items array
 * @param {string} storageKeyPrefix - localStorage key prefix for this nav section
 * @param {string|null} tenantId - The current tenant ID for scoping
 * @param {Object} options - Additional options
 * @param {Object} options.user - Current user object with permissions
 * @param {Function} options.saveToDatabase - Async function to save order to database
 * @param {string} options.databaseKey - Key in user.permissions for this nav order
 * @returns {Object} { orderedItems, setOrder, resetOrder, hasCustomOrder }
 */
export function useNavOrder(
  defaultItems, 
  storageKeyPrefix = NAV_ORDER_KEY_PREFIX, 
  tenantId = null,
  options = {}
) {
  const { user, saveToDatabase, databaseKey } = options;
  
  // Build the full storage key with tenant scope
  const storageKey = buildStorageKey(storageKeyPrefix, tenantId);
  
  // Track if we've done initial sync from database
  const hasSyncedFromDb = useRef(false);
  
  // Initialize order state - prioritize database value over localStorage
  const [order, setOrderState] = useState(() => {
    // First, check database value from user.permissions
    const dbOrder = user?.permissions?.[databaseKey];
    if (Array.isArray(dbOrder) && dbOrder.length > 0) {
      console.log("[useNavOrder] Initial mount - using database order:", databaseKey, dbOrder);
      // Also sync to localStorage for consistency
      try {
        localStorage.setItem(storageKey, JSON.stringify(dbOrder));
      } catch (e) {
        console.warn("[useNavOrder] Failed to sync db order to localStorage:", e);
      }
      return dbOrder;
    }
    
    // Fallback to localStorage
    try {
      const saved = localStorage.getItem(storageKey);
      console.log("[useNavOrder] Initial mount - storageKey:", storageKey, "tenant:", tenantId, "saved:", saved ? "YES" : "NO");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("[useNavOrder] Failed to parse saved order:", e);
    }
    return null;
  });

  // Sync from database when user changes (e.g., after sign-in)
  useEffect(() => {
    const dbOrder = user?.permissions?.[databaseKey];
    
    // If we have a database value, use it as source of truth
    if (Array.isArray(dbOrder) && dbOrder.length > 0) {
      console.log("[useNavOrder] Syncing from database:", databaseKey, dbOrder);
      setOrderState(dbOrder);
      // Sync to localStorage for consistency
      try {
        localStorage.setItem(storageKey, JSON.stringify(dbOrder));
      } catch (e) {
        console.warn("[useNavOrder] Failed to sync db order to localStorage:", e);
      }
      hasSyncedFromDb.current = true;
    } else if (hasSyncedFromDb.current === false) {
      // No database value - check localStorage
      try {
        const saved = localStorage.getItem(storageKey);
        console.log("[useNavOrder] No db order, checking localStorage - key:", storageKey, "found:", saved ? "YES" : "NO");
        if (saved) {
          const parsed = JSON.parse(saved);
          console.log("[useNavOrder] Setting order from localStorage:", parsed);
          setOrderState(parsed);
        } else {
          console.log("[useNavOrder] No saved order found, setting to null");
          setOrderState(null);
        }
      } catch (e) {
        console.error("[useNavOrder] Failed to parse saved order:", e);
        setOrderState(null);
      }
    }
  }, [user?.permissions, databaseKey, storageKey]);

  // Re-read from localStorage when tenant changes (only if no database value)
  useEffect(() => {
    const dbOrder = user?.permissions?.[databaseKey];
    if (Array.isArray(dbOrder) && dbOrder.length > 0) {
      // Database value takes precedence
      return;
    }
    
    console.log("[useNavOrder] useEffect triggered - storageKey changed to:", storageKey, "tenant:", tenantId);
    try {
      const saved = localStorage.getItem(storageKey);
      console.log("[useNavOrder] Read from storage - key:", storageKey, "found:", saved ? "YES" : "NO", "value:", saved);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log("[useNavOrder] Setting order to:", parsed);
        setOrderState(parsed);
      } else {
        console.log("[useNavOrder] No saved order found, setting to null");
        setOrderState(null);
      }
    } catch (e) {
      console.error("[useNavOrder] Failed to parse saved order on tenant change:", e);
      setOrderState(null);
    }
  }, [storageKey, tenantId, user?.permissions, databaseKey]);

  // Apply order to items - returns items sorted by saved order
  const orderedItems = useCallback(() => {
    console.log("[useNavOrder] Calculating orderedItems - current order:", order, "defaultItems count:", defaultItems.length);
    if (!order || !Array.isArray(order)) {
      console.log("[useNavOrder] No custom order, returning default items");
      return defaultItems;
    }

    // Create a map of href -> item for quick lookup
    const itemMap = new Map(defaultItems.map((item) => [item.href, item]));
    
    // Build ordered array from saved order, filtering out any items that no longer exist
    const ordered = [];
    const usedHrefs = new Set();
    
    for (const href of order) {
      if (itemMap.has(href) && !usedHrefs.has(href)) {
        ordered.push(itemMap.get(href));
        usedHrefs.add(href);
      }
    }
    
    // Append any new items that weren't in the saved order
    for (const item of defaultItems) {
      if (!usedHrefs.has(item.href)) {
        ordered.push(item);
      }
    }
    
    console.log("[useNavOrder] Returning ordered items:", ordered.length, "items");
    return ordered;
  }, [defaultItems, order]);

  // Save order to localStorage, state, and database
  const setOrder = useCallback(async (newOrder) => {
    try {
      const orderArray = Array.isArray(newOrder) 
        ? newOrder.map(item => typeof item === 'string' ? item : item.href)
        : newOrder;
      console.log("[useNavOrder] Saving order - key:", storageKey, "order:", orderArray);
      
      // Save to localStorage immediately for responsive UI
      localStorage.setItem(storageKey, JSON.stringify(orderArray));
      setOrderState(orderArray);
      
      // Also persist to database if saveToDatabase callback is provided
      if (saveToDatabase && typeof saveToDatabase === 'function') {
        try {
          await saveToDatabase(orderArray);
          console.log("[useNavOrder] Saved order to database:", databaseKey);
        } catch (dbError) {
          console.error("[useNavOrder] Failed to save order to database:", dbError);
          // Don't throw - localStorage save succeeded, database save is best-effort
        }
      }
    } catch (e) {
      console.error("[useNavOrder] Failed to save order:", e);
    }
  }, [storageKey, saveToDatabase, databaseKey]);

  // Reset to default order (both localStorage and database)
  const resetOrder = useCallback(async () => {
    try {
      localStorage.removeItem(storageKey);
      setOrderState(null);
      
      // Also reset in database if saveToDatabase callback is provided
      if (saveToDatabase && typeof saveToDatabase === 'function') {
        try {
          await saveToDatabase(null);
          console.log("[useNavOrder] Reset order in database:", databaseKey);
        } catch (dbError) {
          console.error("[useNavOrder] Failed to reset order in database:", dbError);
        }
      }
    } catch (e) {
      console.error("[useNavOrder] Failed to reset order:", e);
    }
  }, [storageKey, saveToDatabase, databaseKey]);

  return {
    orderedItems: orderedItems(),
    setOrder,
    resetOrder,
    hasCustomOrder: order !== null,
  };
}

/**
 * Primary navigation order hook (tenant-scoped with database persistence)
 * @param {Array} defaultItems - Default navigation items
 * @param {string|null} tenantId - Current tenant ID for isolation
 * @param {Object} options - Additional options (user, saveToDatabase)
 */
export function usePrimaryNavOrder(defaultItems, tenantId = null, options = {}) {
  return useNavOrder(defaultItems, NAV_ORDER_KEY_PREFIX, tenantId, {
    ...options,
    databaseKey: 'navigation_order',
  });
}

/**
 * Secondary navigation order hook (tenant-scoped with database persistence)
 * @param {Array} defaultItems - Default navigation items
 * @param {string|null} tenantId - Current tenant ID for isolation
 * @param {Object} options - Additional options (user, saveToDatabase)
 */
export function useSecondaryNavOrder(defaultItems, tenantId = null, options = {}) {
  return useNavOrder(defaultItems, SECONDARY_NAV_ORDER_KEY_PREFIX, tenantId, {
    ...options,
    databaseKey: 'secondary_navigation_order',
  });
}

export default useNavOrder;
