/**
 * Database access layer stub
 * This re-exports or wraps your actual Supabase client for use in frontend modules
 */

// For now, this is a stub that will be mocked in tests
// In production, this would connect to your actual database

export interface Lead {
  id: string;
  name: string;
  tenantId?: string;
  email?: string;
  phone?: string;
}

export interface DbClient {
  leads: {
    findFirst: (query: {
      where: { tenantId: string; name?: { contains: string } };
    }) => Promise<Lead | null>;
  };
}

// Stub implementation - replace with actual DB client in production
export const db: DbClient = {
  leads: {
    findFirst: async (query) => {
      console.log("[DB] findFirst called with:", query);
      // This will be mocked in tests
      return null;
    },
  },
};
