import { io } from 'socket.io-client';
import { getBackendUrl } from '@/api/backendUrl';

/**
 * Activity Tracker Singleton
 * 
 * Provides a simple interface to emit activity events without React hooks.
 * Can be used from anywhere in the app (API functions, event handlers, etc.)
 */

let socketInstance = null;
let connectionAttempted = false;

/**
 * Get cookie value by name
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null if not found
 */
function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

/**
 * Initialize socket connection (called automatically on first emit)
 */
function getSocket() {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  if (connectionAttempted && socketInstance) {
    // Already tried to connect, return existing instance
    return socketInstance;
  }

  connectionAttempted = true;

  const backendUrl = getBackendUrl();
  const token =
    getCookie('aisha_access_token') ||
    getCookie('aisha_access') ||
    getCookie('aisha_accessToken');

  const socketOptions = {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  };

  if (token) {
    socketOptions.auth = { token };
  }

  socketInstance = io(backendUrl, socketOptions);

  socketInstance.on('connect', () => {
    console.log('ActivityTracker: Connected');
  });

  socketInstance.on('disconnect', (reason) => {
    console.log('ActivityTracker: Disconnected', reason);
  });

  return socketInstance;
}

/**
 * Track entity mutation (create, update, delete)
 * @param {string} action - 'create', 'update', or 'delete'
 * @param {string} entityType - 'contact', 'account', 'lead', etc.
 * @param {string} entityId - Entity ID
 * @param {string} [entityName] - Optional entity name for display
 */
export function trackMutation(action, entityType, entityId, entityName = null) {
  const socket = getSocket();
  if (!socket || !socket.connected) {
    console.debug('ActivityTracker: Socket not connected, skipping mutation event');
    return;
  }

  socket.emit('entity_mutation', {
    action,
    entityType,
    entityId,
    entityName,
  });

  console.debug(`ActivityTracker: ${action} ${entityType}/${entityId}`);
}

/**
 * Track page view
 * @param {string} page - Page path or name
 * @param {string} [entityType] - Optional entity type
 * @param {string} [entityId] - Optional entity ID
 */
export function trackPageView(page, entityType = null, entityId = null) {
  const socket = getSocket();
  if (!socket || !socket.connected) {
    console.debug('ActivityTracker: Socket not connected, skipping page view event');
    return;
  }

  socket.emit('page_view', {
    page,
    entityType,
    entityId,
  });

  console.debug(`ActivityTracker: Page view → ${page}`);
}

/**
 * Disconnect socket
 */
export function disconnect() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    connectionAttempted = false;
  }
}

export default {
  trackMutation,
  trackPageView,
  disconnect,
};
