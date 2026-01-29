/**
 * AiShaActionHandler - Component that listens for and handles AiSHA UI actions
 * 
 * This component:
 * - Listens for 'aisha:ai-local-action' events from AI responses
 * - Routes actions to appropriate handlers (navigation, editing, etc.)
 * - Provides page context to AiSHA
 * 
 * Should be rendered once within the Router context.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';

// Route patterns for entity detection
const ENTITY_PATTERNS = [
  { pattern: /^\/leads/, entity: 'leads', label: 'Leads' },
  { pattern: /^\/accounts/, entity: 'accounts', label: 'Accounts' },
  { pattern: /^\/contacts/, entity: 'contacts', label: 'Contacts' },
  { pattern: /^\/opportunities/, entity: 'opportunities', label: 'Opportunities' },
  { pattern: /^\/activities/, entity: 'activities', label: 'Activities' },
  { pattern: /^\/calendar/, entity: 'calendar', label: 'Calendar' },
  { pattern: /^\/workflows/, entity: 'workflows', label: 'Workflows' },
  { pattern: /^\/bizdev-sources/, entity: 'bizdev-sources', label: 'BizDev Sources' },
  { pattern: /^\/projects/, entity: 'projects', label: 'Projects' },
  { pattern: /^\/workers/, entity: 'workers', label: 'Workers' },
  { pattern: /^\/$|^\/dashboard/, entity: 'dashboard', label: 'Dashboard' },
];

export default function AiShaActionHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const contextRef = useRef({});

  // Update page context whenever location changes
  useEffect(() => {
    const path = location.pathname;
    const recordId = params.id || null;
    
    // Find matching entity
    const entityMatch = ENTITY_PATTERNS.find(e => e.pattern.test(path));
    const entityType = entityMatch?.entity || 'general';
    const entityLabel = entityMatch?.label || 'Page';
    
    // Determine view type
    const isDetailView = !!recordId;
    const isListView = entityType !== 'general' && !recordId && !['dashboard', 'settings', 'reports'].includes(entityType);
    
    const context = {
      path,
      recordId,
      entityType,
      entityLabel,
      isDetailView,
      isListView,
      viewType: isDetailView ? 'detail' : (isListView ? 'list' : 'page'),
      timestamp: Date.now(),
    };
    
    contextRef.current = context;
    
    // Make available globally for AI context injection
    window.__aishaPageContext = context;
    
    // Dispatch event for any listeners
    window.dispatchEvent(new CustomEvent('aisha:page-context-updated', {
      detail: context
    }));
    
    if (import.meta.env?.DEV) {
      console.log('[AiSHA Page Context]', context);
    }
  }, [location, params]);

  // Handle AI actions
  const handleAiAction = useCallback((event) => {
    const action = event.detail;
    if (!action) return;

    console.log('[AiSHA Action Handler] Received action:', action);

    switch (action.action) {
      case 'navigate': {
        // Handle navigation requests from AI
        let targetPath = action.path;
        
        // Skip actions with placeholder record_id - wait for the real one
        if (action.record_id === '<UNKNOWN>') {
          console.log('[AiSHA Action Handler] Skipping navigation with <UNKNOWN> record_id');
          return;
        }
        
        // If record_id is provided, dispatch open-details event to open detail panel
        // instead of navigating to the profile page
        if (action.record_id && action.page) {
          // Check if we're already on the correct page
          const listPath = `/${action.page}`;
          const currentPath = window.location.pathname;
          const needsNavigation = currentPath !== listPath;
          
          if (needsNavigation) {
            // Navigate first, then dispatch event after component mounts
            navigate(listPath);
          }
          
          // Dispatch event to open the detail panel for this record
          // Longer delay if navigating to ensure component is mounted
          const delay = needsNavigation ? 500 : 100;
          setTimeout(() => {
            console.log('[AiSHA Action Handler] Dispatching aisha:open-details:', { id: action.record_id, type: action.page });
            window.dispatchEvent(new CustomEvent('aisha:open-details', {
              detail: { 
                id: action.record_id, 
                type: action.page 
              }
            }));
          }, delay);
          
          toast.success(`Opening ${action.page} details`);
        } else if (targetPath) {
          navigate(targetPath);
          toast.success(`Navigated to ${action.page || targetPath}`);
        }
        break;
      }
      
      case 'edit_record': {
        // Dispatch event to open edit modal for a specific record
        window.dispatchEvent(new CustomEvent('aisha:open-edit', {
          detail: { 
            id: action.record_id, 
            type: action.entity_type,
            field: action.field,
            value: action.value
          }
        }));
        toast.info(`Opening ${action.entity_type || 'record'} for editing...`);
        break;
      }
      
      case 'select_row': {
        // Dispatch event to highlight/select a row in a table
        window.dispatchEvent(new CustomEvent('aisha:select-row', {
          detail: { id: action.record_id }
        }));
        break;
      }
      
      case 'open_form': {
        // Dispatch event to open a create form
        window.dispatchEvent(new CustomEvent('aisha:open-form', {
          detail: { 
            type: action.entity_type,
            prefill: action.prefill_data 
          }
        }));
        toast.info(`Opening ${action.entity_type || 'form'}...`);
        break;
      }
      
      case 'refresh': {
        // Dispatch event to refresh current view
        window.dispatchEvent(new CustomEvent('aisha:refresh', {
          detail: { type: action.entity_type }
        }));
        toast.info('Refreshing...');
        break;
      }
      
      case 'scroll_to': {
        // Scroll to a specific element
        const element = document.getElementById(action.element_id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('aisha-highlight');
          setTimeout(() => element.classList.remove('aisha-highlight'), 2000);
        }
        break;
      }
      
      default:
        console.warn('[AiSHA Action Handler] Unknown action type:', action.action);
    }
  }, [navigate]);

  // Listen for AI actions
  useEffect(() => {
    window.addEventListener('aisha:ai-local-action', handleAiAction);
    return () => window.removeEventListener('aisha:ai-local-action', handleAiAction);
  }, [handleAiAction]);

  // This component doesn't render anything
  return null;
}
