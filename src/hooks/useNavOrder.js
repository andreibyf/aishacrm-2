import { useState, useCallback } from "react";

const NAV_ORDER_KEY = "aisha_crm_nav_order";
const SECONDARY_NAV_ORDER_KEY = "aisha_crm_secondary_nav_order";

/**
 * Hook to manage navigation item order with localStorage persistence
 * 
 * @param {Array} defaultItems - The default navigation items array
 * @param {string} storageKey - localStorage key for this nav section
 * @returns {Object} { orderedItems, setOrder, resetOrder }
 */
export function useNavOrder(defaultItems, storageKey = NAV_ORDER_KEY) {
  const [order, setOrderState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("[useNavOrder] Failed to parse saved order:", e);
    }
    return null;
  });

  // Apply order to items - returns items sorted by saved order
  const orderedItems = useCallback(() => {
    if (!order || !Array.isArray(order)) {
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
    
    return ordered;
  }, [defaultItems, order]);

  // Save order to localStorage and state
  const setOrder = useCallback((newOrder) => {
    try {
      const orderArray = Array.isArray(newOrder) 
        ? newOrder.map(item => typeof item === 'string' ? item : item.href)
        : newOrder;
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
 * Primary navigation order hook
 */
export function usePrimaryNavOrder(defaultItems) {
  return useNavOrder(defaultItems, NAV_ORDER_KEY);
}

/**
 * Secondary navigation order hook
 */
export function useSecondaryNavOrder(defaultItems) {
  return useNavOrder(defaultItems, SECONDARY_NAV_ORDER_KEY);
}

export default useNavOrder;
