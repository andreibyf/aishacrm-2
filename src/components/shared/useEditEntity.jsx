import { useState, useEffect } from 'react';

/**
 * Generic hook for managing entity edit state
 * @template T - The entity type
 * @returns {Object} Edit state and control functions
 */
export function useEditEntity() {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);

  const openEdit = (entity) => {
    console.log('[useEditEntity] openEdit called with:', entity ? 'entity object' : 'null');
    setSelectedEntity(entity);
    setIsEditOpen(true);
  };

  const closeEdit = () => {
    console.log('[useEditEntity] closeEdit called');
    setIsEditOpen(false);
    // Small delay before clearing entity to prevent UI flash
    setTimeout(() => setSelectedEntity(null), 300);
  };

  // Log state changes but avoid circular references
  useEffect(() => {
    console.log('[useEditEntity] State updated - isEditOpen:', isEditOpen, 'hasEntity:', !!selectedEntity);
  }, [isEditOpen, selectedEntity]);

  return {
    isEditOpen,
    selectedEntity,
    openEdit,
    closeEdit,
  };
}