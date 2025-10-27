// Mock user for local development (when Base44 auth is disabled)
export const createMockUser = () => ({
  id: 'local-dev-user-001',
  email: 'dev@localhost',
  name: 'Local Dev User',
  role: 'superadmin', // Full access for local testing
  tenant_id: 'local-tenant-001',
  permissions: {
    role: 'power-user',
    dashboard_scope: 'all',
    can_manage_settings: true,
    can_manage_users: true,
    can_view_reports: true,
    can_export_data: true,
  },
  // Full navigation permissions for local dev - all pages accessible
  navigation_permissions: {
    Dashboard: true,
    Contacts: true,
    Accounts: true,
    Opportunities: true,
    Activities: true,
    Leads: true,
    Calendar: true,
    Reports: true,
    Settings: true,
    Documentation: true,
    Employees: true,
    Tenants: true,
    Integrations: true,
    AuditLog: true,
    CashFlow: true,
    DocumentProcessing: true,
    DocumentManagement: true,
    AICampaigns: true,
    Agent: true,
    BizDevSources: true,
    ClientOnboarding: true,
    ClientRequirements: true,
    Workflows: true,
    WorkflowGuide: true,
    Utilities: true,
    SystemLogs: true,
  },
  tier: 'Tier4',
  branding_settings: {
    companyName: 'Ai-SHA CRM (Local Dev)',
    logoUrl: null,
    primaryColor: '#06b6d4',
    accentColor: '#6366f1',
  },
  last_login: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// Mock tenant for local development
export const createMockTenant = () => ({
  id: 'local-tenant-001',
  name: 'Local Development Tenant',
  logo_url: null,
  primary_color: '#06b6d4',
  accent_color: '#6366f1',
  elevenlabs_agent_id: null,
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const isLocalDevMode = () => {
  // Use local backend mode if the backend URL is configured
  const hasBackendUrl = !!import.meta.env.VITE_AISHACRM_BACKEND_URL;
  
  // If backend URL is set, use local backend (even with Supabase auth)
  if (hasBackendUrl) {
    return true;
  }
  
  // Otherwise, fallback to original logic:
  // Use local dev mode (mock users) if:
  // 1. Base44 auth is disabled AND
  // 2. Supabase is not configured
  const useBase44 = import.meta.env.VITE_USE_BASE44_AUTH === 'true';
  const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  
  // If Supabase is configured, use it (not local dev mode)
  // If Base44 is enabled, use it (not local dev mode)
  // Otherwise, use local dev mode with mock users
  return !useBase44 && !hasSupabase;
};
