/**
 * Typed shape for tenant.branding_settings (jsonb).
 *
 * The DB stores branding fields as a free-form jsonb blob — Supabase's
 * generated `Database` types model this as `Json | null`, which means
 * code that does `tenantRow.branding_settings.logo_url` is a TS error.
 * That's correct: nothing at the DB level guarantees those fields exist.
 *
 * Routes that need to read branding values cast through this interface so
 * the editor still surfaces typos (`primry_color` won't autocomplete) while
 * acknowledging that any field can be missing at runtime.
 *
 * Usage:
 *   import type { TenantBranding } from '../types/branding.types.ts';
 *   const branding = (tenantRow.branding_settings ?? {}) as TenantBranding;
 *   const logo = branding.logo_url ?? null;
 */
export interface TenantBranding {
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
}
