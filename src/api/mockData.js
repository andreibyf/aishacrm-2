// Mock user for local development (when Base44 auth is disabled)
export const createMockUser = () => ({
  id: 'local-dev-user-001',
  email: 'dev@localhost',
  name: 'Local Dev User',
  role: 'superadmin', // Full access for local testing
  tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
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
  id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
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
  // Safety hatch: Allow disabling mock mode via localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem('DISABLE_MOCK_USER') === 'true') {
      return false;
    }
    if (typeof window !== 'undefined' && window.localStorage.getItem('FORCE_MOCK_USER') === 'true') {
      return true;
    }
  } catch { /* ignore */ }

  // Local dev mode means: no real auth/backends are configured
  // Only check for Supabase (Base44 removed)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  // Check all possible key names
  const supabaseAnonKey = 
    import.meta.env.VITE_SUPABASE_ANON_KEY || 
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
    import.meta.env.VITE_SUPABASE_PUBLIC_KEY;

  // Check if credentials are placeholders or example values
  const isPlaceholder = !supabaseAnonKey || 
    supabaseAnonKey.includes('your_') || 
    supabaseAnonKey.includes('placeholder');
    
  const hasSupabase = !!(supabaseUrl && supabaseAnonKey && !isPlaceholder);

  // If Supabase auth is configured with real credentials, we're NOT in local dev mode
  if (hasSupabase) return false;

  // Otherwise, fall back to mock/local dev mode
  return true;
};
