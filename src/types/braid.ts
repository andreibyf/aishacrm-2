/**
 * Braid-specific type definitions
 * Extends the base types from braid-mcp-node-server
 */

export interface BraidFilter {
  field: string;
  value: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'like' | 'contains';
  op?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'like' | 'contains';
}

export interface BraidCredentials {
  api_key?: string;
  apiKey?: string;
  api_secret?: string;
  apiSecret?: string;
  access_token?: string;
  accessToken?: string;
  refresh_token?: string;
  refreshToken?: string;
}

export interface SystemSettings {
  system_openai_settings?: {
    enabled: boolean;
    openai_api_key?: string;
  };
  [key: string]: unknown;
}

export interface TenantIntegration {
  api_credentials: BraidCredentials | Record<string, unknown>;
  integration_type: string;
  is_active: boolean;
  updated_at?: string;
  created_at?: string;
}
