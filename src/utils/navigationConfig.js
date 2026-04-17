/**
 * Navigation Configuration
 *
 * Centralized configuration for navigation items and module mappings.
 * This module helps maintain consistent navigation structure across the application.
 *
 * @module utils/navigationConfig
 */

/**
 * Main navigation items displayed in the primary sidebar
 */
export const navItems = [
  { href: 'Dashboard', label: 'Dashboard' },
  { href: 'Contacts', label: 'Contacts' },
  { href: 'Accounts', label: 'Accounts' },
  { href: 'Leads', label: 'Leads' },
  { href: 'Opportunities', label: 'Opportunities' },
  { href: 'Activities', label: 'Activities' },
  { href: 'Communications', label: 'Communications' },
  { href: 'Calendar', label: 'Calendar' },
  { href: 'ConstructionProjects', label: 'Project Management' },
  { href: 'Workers', label: 'Workers' },
  { href: 'BizDevSources', label: 'Potential Leads' },
  { href: 'CashFlow', label: 'Cash Flow' },
  { href: 'DocumentProcessing', label: 'Document Processing' },
  { href: 'DocumentManagement', label: 'Document Management' },
  { href: 'AICampaigns', label: 'AI Campaigns' },
  { href: 'AISuggestions', label: 'AI Suggestions' },
  { href: 'Employees', label: 'Employees' },
  { href: 'Reports', label: 'Reports' },
  { href: 'Integrations', label: 'Integrations' },
  { href: 'Workflows', label: 'Workflows' },
  { href: 'PaymentPortal', label: 'Payment Portal' },
  { href: 'Utilities', label: 'Utilities' },
  { href: 'ClientOnboarding', label: 'Client Onboarding' },
];

/**
 * Secondary navigation items (documentation, tools, etc.)
 */
export const secondaryNavItems = [
  { href: 'Documentation', label: 'Documentation' },
  { href: 'DeveloperAI', label: 'Developer AI' },
  { href: 'ClientRequirements', label: 'Client Requirements' },
  { href: 'CareWorkflows', label: 'CARE Workflows' },
];

/**
 * Map page names to their corresponding module IDs
 * Used for checking if a module is enabled/disabled
 */
export const moduleMapping = {
  Dashboard: 'Dashboard',
  Contacts: 'Contact Management',
  Accounts: 'Account Management',
  Leads: 'Lead Management',
  Opportunities: 'Opportunities',
  Activities: 'Activity Tracking',
  Communications: 'Activity Tracking',
  Calendar: 'Calendar',
  BizDevSources: 'Potential Leads',
  CashFlow: 'Cash Flow Management',
  DocumentProcessing: 'Document Processing & Management',
  DocumentManagement: 'Document Processing & Management',
  Employees: 'Employee Management',
  Reports: 'Analytics & Reports',
  Integrations: 'Integrations',
  PaymentPortal: 'Payment Portal',
  AICampaigns: 'AI Campaigns',
  AISuggestions: 'AI Suggestions',
  DeveloperAI: 'Developer AI',
  Utilities: 'Utilities',
  ClientOnboarding: 'Client Onboarding',
  Workflows: 'Workflows',
  ConstructionProjects: 'Project Management',
  Workers: 'Workers',
  DuplicateContacts: null,
  DuplicateAccounts: null,
  DuplicateLeads: null,
  Tenants: null,
  Settings: null,
  Documentation: null,
  AuditLog: null,
  UnitTests: null,
  ClientRequirements: null,
  CareWorkflows: 'CARE Workflows',
};

/**
 * Pages that don't require CRM access
 * These pages are accessible even when user.crm_access is false
 */
export const pagesAllowedWithoutCRM = new Set([
  'Documentation',
  'DeveloperAI',
  'Settings',
  'AuditLog',
  'UnitTests',
  'ClientRequirements',
]);

/**
 * System pages accessible to admins and superadmins only
 */
export const systemPages = new Set([
  'Documentation',
  'AuditLog',
  'Tenants',
  'UnitTests',
  'ClientRequirements',
  'DeveloperAI',
]);

/**
 * Get all page names from navigation configuration
 *
 * @returns {string[]} Array of all page names
 */
export function getAllPageNames() {
  return [
    ...navItems.map((item) => item.href),
    ...secondaryNavItems.map((item) => item.href),
    'Settings',
    'Tenants',
    'AuditLog',
    'UnitTests',
    'DataDiagnostics',
    'TenantDataDebug',
    'DuplicateContacts',
    'DuplicateAccounts',
    'DuplicateLeads',
    'DataQualityReport',
    'Agent',
    'WorkflowGuide',
  ];
}
