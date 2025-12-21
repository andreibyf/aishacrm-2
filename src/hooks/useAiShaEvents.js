/**
 * useAiShaEvents - Hook for page components to listen for AiSHA UI actions
 * 
 * Provides event listeners for:
 * - aisha:open-edit - Open edit modal for a record
 * - aisha:select-row - Highlight/select a row
 * - aisha:open-form - Open create form
 * - aisha:refresh - Refresh data
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.entityType - The entity type this page handles (e.g., 'leads', 'accounts')
 * @param {Function} options.onOpenEdit - Called when AI requests to edit a record (receives {id, field, value})
 * @param {Function} options.onSelectRow - Called when AI requests to select a row (receives {id})
 * @param {Function} options.onOpenForm - Called when AI requests to open create form (receives {prefill})
 * @param {Function} options.onRefresh - Called when AI requests a refresh
 */

import { useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export function useAiShaEvents({
  entityType,
  onOpenEdit,
  onSelectRow,
  onOpenForm,
  onRefresh,
}) {
  
  // Handle edit request
  const handleOpenEdit = useCallback((event) => {
    const { id, type, field, value } = event.detail || {};
    
    // Only handle if it matches our entity type
    if (type && type !== entityType) return;
    
    if (onOpenEdit && id) {
      console.log(`[AiSHA Events] ${entityType}: Opening edit for record ${id}`);
      onOpenEdit({ id, field, value });
    }
  }, [entityType, onOpenEdit]);

  // Handle row selection
  const handleSelectRow = useCallback((event) => {
    const { id, type } = event.detail || {};
    
    // Only handle if it matches our entity type (or no type specified)
    if (type && type !== entityType) return;
    
    if (onSelectRow && id) {
      console.log(`[AiSHA Events] ${entityType}: Selecting row ${id}`);
      onSelectRow({ id });
      
      // Try to scroll to the element
      setTimeout(() => {
        const rowElement = document.querySelector(`[data-row-id="${id}"]`) || 
                           document.getElementById(`row-${id}`);
        if (rowElement) {
          rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          rowElement.classList.add('aisha-highlight');
          setTimeout(() => rowElement.classList.remove('aisha-highlight'), 2000);
        }
      }, 100);
    }
  }, [entityType, onSelectRow]);

  // Handle form open request
  const handleOpenForm = useCallback((event) => {
    const { type, prefill } = event.detail || {};
    
    // Only handle if it matches our entity type
    if (type && type !== entityType) return;
    
    if (onOpenForm) {
      console.log(`[AiSHA Events] ${entityType}: Opening create form`);
      onOpenForm({ prefill: prefill || {} });
    }
  }, [entityType, onOpenForm]);

  // Handle refresh request
  const handleRefresh = useCallback((event) => {
    const { type } = event.detail || {};
    
    // Only handle if it matches our entity type (or no type specified)
    if (type && type !== entityType && type !== 'all') return;
    
    if (onRefresh) {
      console.log(`[AiSHA Events] ${entityType}: Refreshing data`);
      onRefresh();
      toast.success(`Refreshing ${entityType}...`);
    }
  }, [entityType, onRefresh]);

  // Set up event listeners
  useEffect(() => {
    window.addEventListener('aisha:open-edit', handleOpenEdit);
    window.addEventListener('aisha:select-row', handleSelectRow);
    window.addEventListener('aisha:open-form', handleOpenForm);
    window.addEventListener('aisha:refresh', handleRefresh);

    return () => {
      window.removeEventListener('aisha:open-edit', handleOpenEdit);
      window.removeEventListener('aisha:select-row', handleSelectRow);
      window.removeEventListener('aisha:open-form', handleOpenForm);
      window.removeEventListener('aisha:refresh', handleRefresh);
    };
  }, [handleOpenEdit, handleSelectRow, handleOpenForm, handleRefresh]);
}

export default useAiShaEvents;
