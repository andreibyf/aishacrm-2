import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSocket } from './useSocket';

/**
 * Custom hook for tracking user activity (page views, entity mutations)
 * 
 * Automatically emits page view events when route changes.
 * Provides methods to emit entity mutation events.
 * 
 * @returns {Object} { trackMutation, trackPageView, connected }
 */
export function useActivityTracking() {
  const { socket, connected } = useSocket();
  const location = useLocation();
  const lastPageRef = useRef(null);

  // Track page views on route change
  useEffect(() => {
    if (!socket || !connected) return;

    const currentPath = location.pathname;

    // Avoid duplicate events for same page
    if (lastPageRef.current === currentPath) return;
    lastPageRef.current = currentPath;

    // Parse entity info from URL
    const entityInfo = parseEntityFromPath(currentPath);

    // Emit page view event
    socket.emit('page_view', {
      page: currentPath,
      entityType: entityInfo.type,
      entityId: entityInfo.id,
    });

    console.debug('Activity: Page view →', currentPath);
  }, [socket, connected, location.pathname]);

  /**
   * Track entity mutation (create, update, delete)
   * @param {string} action - 'create', 'update', or 'delete'
   * @param {string} entityType - 'contact', 'account', 'lead', 'opportunity', etc.
   * @param {string} entityId - Entity ID
   * @param {string} [entityName] - Optional entity name for display
   */
  const trackMutation = (action, entityType, entityId, entityName = null) => {
    if (!socket || !connected) {
      console.warn('Activity tracking: Socket not connected');
      return;
    }

    socket.emit('entity_mutation', {
      action,
      entityType,
      entityId,
      entityName,
    });

    console.debug(`Activity: ${action} ${entityType}/${entityId}`);
  };

  /**
   * Manually track page view (useful for non-route changes)
   * @param {string} page - Page name or path
   * @param {string} [entityType] - Optional entity type
   * @param {string} [entityId] - Optional entity ID
   */
  const trackPageView = (page, entityType = null, entityId = null) => {
    if (!socket || !connected) {
      console.warn('Activity tracking: Socket not connected');
      return;
    }

    socket.emit('page_view', {
      page,
      entityType,
      entityId,
    });

    console.debug('Activity: Manual page view →', page);
  };

  return {
    trackMutation,
    trackPageView,
    connected,
  };
}

/**
 * Parse entity type and ID from URL path
 * @param {string} path - URL path
 * @returns {Object} { type, id }
 */
function parseEntityFromPath(path) {
  const result = { type: null, id: null };

  // Match patterns like /contacts/123, /accounts/abc, /leads/xyz, etc.
  const match = path.match(/\/(contacts|accounts|leads|opportunities|activities|bizdevsources|documents)\/([a-zA-Z0-9-]+)/i);

  if (match) {
    result.type = match[1].toLowerCase().replace(/s$/, ''); // Remove trailing 's'
    result.id = match[2];
  }

  return result;
}

export default useActivityTracking;
