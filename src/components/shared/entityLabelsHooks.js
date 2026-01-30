/**
 * Entity Labels Hooks
 * 
 * React hooks extracted from EntityLabelsContext
 * to fix react-refresh/only-export-components warnings.
 */
import { useContext } from 'react';
import { EntityLabelsContext } from './entityLabelsContextDefinition';

/**
 * Hook to access entity labels
 */
export function useEntityLabels() {
  const context = useContext(EntityLabelsContext);
  if (!context) {
    throw new Error('useEntityLabels must be used within EntityLabelsProvider');
  }
  return context;
}

/**
 * Hook to get a specific entity's label (convenience)
 * @param {string} entityKey - e.g., 'leads'
 * @returns {{ plural: string, singular: string }}
 */
export function useEntityLabel(entityKey) {
  const { getLabel, getLabelSingular } = useEntityLabels();
  return {
    plural: getLabel(entityKey),
    singular: getLabelSingular(entityKey),
  };
}