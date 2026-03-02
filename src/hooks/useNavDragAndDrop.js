import { useState, useCallback } from 'react';
import { arrayMove } from '@dnd-kit/sortable';

/**
 * useNavDragAndDrop hook - Manages navigation drag-and-drop state and handlers
 *
 * Provides state and handlers for reordering navigation items via drag-and-drop.
 * Handles both primary and secondary navigation item reordering.
 *
 * @param {Object} params - Hook parameters
 * @param {Array} params.orderedNavItems - Current ordered primary nav items
 * @param {Function} params.setNavOrder - Function to update primary nav order
 * @param {Array} params.orderedSecondaryItems - Current ordered secondary nav items
 * @param {Function} params.setSecondaryOrder - Function to update secondary nav order
 * @param {Function} params.resetNavOrder - Function to reset primary nav order
 * @param {Function} params.resetSecondaryOrder - Function to reset secondary nav order
 * @returns {Object} Drag-and-drop state and handlers
 */
export function useNavDragAndDrop({
  orderedNavItems,
  setNavOrder,
  orderedSecondaryItems,
  setSecondaryOrder,
  resetNavOrder,
  resetSecondaryOrder,
}) {
  const [isDragMode, setIsDragMode] = useState(false);

  // Handle drag end for primary nav
  const handleNavDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        const oldIndex = orderedNavItems.findIndex((item) => item.href === active.id);
        const newIndex = orderedNavItems.findIndex((item) => item.href === over?.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(orderedNavItems, oldIndex, newIndex);
          setNavOrder(newOrder);
        }
      }
    },
    [orderedNavItems, setNavOrder],
  );

  // Handle drag end for secondary nav
  const handleSecondaryDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (active.id !== over?.id) {
        const oldIndex = orderedSecondaryItems.findIndex((item) => item.href === active.id);
        const newIndex = orderedSecondaryItems.findIndex((item) => item.href === over?.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(orderedSecondaryItems, oldIndex, newIndex);
          setSecondaryOrder(newOrder);
        }
      }
    },
    [orderedSecondaryItems, setSecondaryOrder],
  );

  // Reset all nav order to default
  const handleResetNavOrder = useCallback(() => {
    resetNavOrder();
    resetSecondaryOrder();
    setIsDragMode(false);
  }, [resetNavOrder, resetSecondaryOrder]);

  return {
    isDragMode,
    setIsDragMode,
    handleNavDragEnd,
    handleSecondaryDragEnd,
    handleResetNavOrder,
  };
}
