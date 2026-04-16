import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getBackendUrl } from '@/api/backendUrl';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';

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
 * Custom hook for WebSocket connection
 * 
 * Features:
 * - Automatic reconnection
 * - JWT authentication via cookies
 * - Connection state management
 * - Event subscriptions
 * 
 * @param {string} namespace - Socket.IO namespace (default: '/')
 * @returns {Object} { socket, connected, error }
 */
export function useSocket(namespace = '/') {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const { authCookiesReady } = useAuthCookiesReady();

  useEffect(() => {
    if (!authCookiesReady) {
      return;
    }

    // Get backend URL from environment
    const backendUrl = getBackendUrl();

    // Optional token for non-httpOnly environments. Primary auth is cookie-based.
    const token =
      getCookie('aisha_access_token') ||
      getCookie('aisha_access') ||
      getCookie('aisha_accessToken');

    // Create socket connection
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

    const socket = io(`${backendUrl}${namespace}`, socketOptions);

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server forcefully disconnected, try to reconnect
        socket.connect();
      }
    });

    socket.on('connect_error', (err) => {
      console.error('WebSocket connection error:', err.message);
      setError(err.message);
      setConnected(false);
    });

    socket.on('error', (err) => {
      console.error('WebSocket error:', err);
      setError(err.message || 'WebSocket error');
    });

    // Store socket reference
    socketRef.current = socket;

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [namespace, authCookiesReady]);

  return {
    socket: socketRef.current,
    connected,
    error,
  };
}

export default useSocket;
