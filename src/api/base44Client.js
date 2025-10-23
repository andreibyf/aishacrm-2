import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication required
// SECURITY: appId should be loaded from environment variable
// LOCAL DEV: Set requiresAuth to false to bypass Base44 authentication
const useBase44Auth = import.meta.env.VITE_USE_BASE44_AUTH === 'true';

// Create a mock client for local development that doesn't make network requests
const createMockBase44Client = () => ({
  entities: new Proxy({}, {
    get: () => ({
      list: () => Promise.resolve([]),
      get: () => Promise.resolve(null),
      create: () => Promise.resolve({ id: 'mock-id' }),
      update: () => Promise.resolve({ id: 'mock-id' }),
      delete: () => Promise.resolve({ success: true }),
      bulkCreate: (items) => Promise.resolve(items?.map((_, i) => ({ id: `mock-id-${i}` })) || []),
    })
  }),
  functions: new Proxy({}, {
    get: () => () => Promise.resolve({ success: false, message: 'Function not available in local dev mode' })
  }),
  auth: {
    me: () => Promise.resolve(null),
    signIn: () => Promise.resolve(null),
    signOut: () => Promise.resolve(null),
    signUp: () => Promise.resolve(null),
  }
});

export const base44 = useBase44Auth 
  ? createClient({
      appId: import.meta.env.VITE_BASE44_APP_ID || "68f83fa997417472c872be53", 
      requiresAuth: true
    })
  : createMockBase44Client();
