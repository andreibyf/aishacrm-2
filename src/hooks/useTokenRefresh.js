import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

/**
 * Proactive JWT Token Refresh Manager
 * 
 * Features:
 * - Decodes aisha_access cookie to check expiration
 * - Auto-refreshes 2 minutes before expiry
 * - Shows session warning toasts
 * - Auto-logout on persistent failures
 * - Prevents multiple simultaneous refreshes
 */

const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

// Parse JWT payload without verification (client-side visibility only)
function parseJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Extract cookie value by name
function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

export function useTokenRefresh({ 
  enabled = true,
  onSessionExpired = null 
} = {}) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const warningShownRef = useRef(false);
  const lastRefreshAttemptRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let checkTimer;

    // Listen for auth session expiry events from fetchWithBackoff
    const handleAuthExpired = (event) => {
      console.log('[TokenRefresh] Session expired event received:', event.detail);
      
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
        duration: 5000,
      });

      // Call custom handler or redirect
      if (onSessionExpired) {
        onSessionExpired();
      } else {
        setTimeout(() => {
          window.location.href = '/?session_expired=true';
        }, 2000);
      }
    };

    window.addEventListener('auth-session-expired', handleAuthExpired);

    const checkTokenAndRefresh = async () => {
      // Prevent concurrent refreshes
      if (refreshingRef.current) return;

      const token = getCookie('aisha_access');
      if (!token) {
        // No token - user not logged in or already logged out
        warningShownRef.current = false;
        return;
      }

      const payload = parseJWT(token);
      if (!payload || !payload.exp) {
        console.warn('[TokenRefresh] Invalid JWT payload');
        return;
      }

      const now = Date.now();
      const expiresAt = payload.exp * 1000; // Convert to milliseconds
      const timeUntilExpiry = expiresAt - now;

      if (import.meta.env.DEV) {
        console.log('[TokenRefresh] Status:', {
          expiresIn: Math.round(timeUntilExpiry / 1000) + 's',
          expiresAt: new Date(expiresAt).toISOString(),
          email: payload.email
        });
      }

      // Token already expired - try immediate refresh or logout
      if (timeUntilExpiry <= 0) {
        console.warn('[TokenRefresh] Token expired, attempting refresh');
        await attemptRefresh('Token has expired');
        return;
      }

      // Show warning toast 5 minutes before expiry (once)
      if (timeUntilExpiry <= WARNING_BEFORE_EXPIRY_MS && !warningShownRef.current) {
        const minutesLeft = Math.ceil(timeUntilExpiry / 60000);
        toast({
          title: "Session Expiring Soon",
          description: `Your session will expire in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}. Activity will auto-refresh your session.`,
          variant: "default",
          duration: 10000,
        });
        warningShownRef.current = true;
      }

      // Auto-refresh 2 minutes before expiry
      if (timeUntilExpiry <= REFRESH_BEFORE_EXPIRY_MS) {
        // Prevent refresh spam (max once per minute)
        const timeSinceLastAttempt = now - lastRefreshAttemptRef.current;
        if (timeSinceLastAttempt < 60000) {
          if (import.meta.env.DEV) {
            console.log('[TokenRefresh] Skipping refresh (attempted recently)');
          }
          return;
        }

        console.log('[TokenRefresh] Auto-refreshing token (2min before expiry)');
        await attemptRefresh('Auto-refresh before expiry');
      }
    };

    const attemptRefresh = async (reason) => {
      if (refreshingRef.current) return;

      try {
        refreshingRef.current = true;
        setIsRefreshing(true);
        lastRefreshAttemptRef.current = Date.now();

        console.log('[TokenRefresh] Refreshing:', reason);

        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          console.log('[TokenRefresh] ✓ Token refreshed successfully');
          warningShownRef.current = false; // Reset warning for next cycle
          
          toast({
            title: "Session Renewed",
            description: "Your session has been automatically renewed.",
            variant: "default",
            duration: 3000,
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error('[TokenRefresh] Refresh failed:', response.status, errorData);

          // Show error toast
          toast({
            title: "Session Refresh Failed",
            description: "Please log in again to continue.",
            variant: "destructive",
            duration: 5000,
          });

          // Call custom handler or redirect to login
          if (onSessionExpired) {
            onSessionExpired();
          } else {
            // Wait 3 seconds then redirect
            setTimeout(() => {
              window.location.href = '/?session_expired=true';
            }, 3000);
          }
        }
      } catch (error) {
        console.error('[TokenRefresh] Refresh error:', error);
        
        toast({
          title: "Network Error",
          description: "Failed to refresh session. Please check your connection.",
          variant: "destructive",
          duration: 5000,
        });
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
      }
    };

    // Initial check
    checkTokenAndRefresh();

    // Set up periodic checks
    checkTimer = setInterval(checkTokenAndRefresh, CHECK_INTERVAL_MS);

    return () => {
      if (checkTimer) clearInterval(checkTimer);
      window.removeEventListener('auth-session-expired', handleAuthExpired);
    };
  }, [enabled, toast, onSessionExpired]);

  return { isRefreshing };
}
