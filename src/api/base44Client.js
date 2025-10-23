import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication required
// SECURITY: appId should be loaded from environment variable
// LOCAL DEV: Set requiresAuth to false to bypass Base44 authentication
const useBase44Auth = import.meta.env.VITE_USE_BASE44_AUTH === 'true';

export const base44 = createClient({
  appId: import.meta.env.VITE_BASE44_APP_ID || "68f83fa997417472c872be53", 
  requiresAuth: useBase44Auth // Can be disabled for local development
});
