import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication required
// SECURITY: appId should be loaded from environment variable
export const base44 = createClient({
  appId: import.meta.env.VITE_BASE44_APP_ID || "68f83fa997417472c872be53", 
  requiresAuth: true // Ensure authentication is required for all operations
});
