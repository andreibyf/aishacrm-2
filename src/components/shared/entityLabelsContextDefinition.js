/**
 * Entity Labels Context
 * 
 * React context definition extracted to fix react-refresh/only-export-components warnings.
 */
import { createContext } from 'react';
import { DEFAULT_LABELS } from './entityLabelsUtils';

export const EntityLabelsContext = createContext({
  labels: DEFAULT_LABELS,
  getLabel: () => '',
  getLabelSingular: () => '',
  getNavLabel: () => '',
  loading: false,
  refresh: () => {},
});