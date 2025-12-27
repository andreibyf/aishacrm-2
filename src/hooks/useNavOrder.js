import { useState, useCallback, useEffect } from "react";

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
 * Hook to manage navigation item order with localStorage persistence
 * Per-tenant isolation: each tenant has its own navigation order.
 * 
 * @param {Array} defaultItems - The default navigation items array
 * @param {string} storageKeyPrefix - localStorage key prefix for this nav section
 * @param {string|null} tenantId - The current tenant ID for scoping
 * @returns {Object} { orderedItems, setOrder, resetOrder }
 */
export function useNavOrder(defaultItems, storageKeyPrefix = NAV_ORDER_KEY_PREFIX, tenantId = null) {
  // Build the full storage key with tenant scope
  const storageKey = buildStorageKey(storageKeyPrefix, tenantId);
  
  const [order, setOrderState] = useState(() => {
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

  // Re-read from localStorage when tenant changes
  useEffect(() => {
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
  }, [storageKey, tenantId]);

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

  // Save order to localStorage and state
  const setOrder = useCallback((newOrder) => {
    try {
      const orderArray = Array.isArray(newOrder) 
        ? newOrder.map(item => typeof item === 'string' ? item : item.href)
        : newOrder;
      console.log("[useNavOrder] Saving order - key:", storageKey, "order:", orderArray);
      localStorage.setItem(storageKey, JSON.stringify(orderArray));
      setOrderState(orderArray);
    } catch (e) {
      console.error("[useNavOrder] Failed to save order:", e);
    }
  }, [storageKey]);

  // Reset to default order
  const resetOrder = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setOrderState(null);
    } catch (e) {
      console.error("[useNavOrder] Failed to reset order:", e);
    }
  }, [storageKey]);

  return {
    orderedItems: orderedItems(),
    setOrder,
    resetOrder,
    hasCustomOrder: order !== null,
  };
}

/**
 * Primary navigation order hook (tenant-scoped)
 * @param {Array} defaultItems - Default navigation items
 * @param {string|null} tenantId - Current tenant ID for isolation
 */
export function usePrimaryNavOrder(defaultItems, tenantId = null) {
  return useNavOrder(defaultItems, NAV_ORDER_KEY_PREFIX, tenantId);
}

/**
 * Secondary navigation order hook (tenant-scoped)
 * @param {Array} defaultItems - Default navigation items
 * @param {string|null} tenantId - Current tenant ID for isolation
 */
export function useSecondaryNavOrder(defaultItems, tenantId = null) {
  return useNavOrder(defaultItems, SECONDARY_NAV_ORDER_KEY_PREFIX, tenantId);
}

export default useNavOrder;
