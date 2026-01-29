/**
 * AiSHA Page Context Utilities
 * 
 * Non-React utility functions extracted from AiShaActionHandler 
 * to fix react-refresh/only-export-components warnings.
 */

/**
 * Get the current page context from anywhere (non-hook)
 */
export function getAiShaPageContext() {
  return window.__aishaPageContext || {
    path: window.location?.pathname || '/',
    entityType: 'general',
    isDetailView: false,
    isListView: false,
  };
}