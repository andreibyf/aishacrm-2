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
  { href: "Dashboard", label: "Dashboard" },
  { href: "Contacts", label: "Contacts" },
  { href: "Accounts", label: "Accounts" },
  { href: "Leads", label: "Leads" },
  { href: "Opportunities", label: "Opportunities" },
  { href: "Activities", label: "Activities" },
  { href: "Calendar", label: "Calendar" },
  { href: "BizDevSources", label: "BizDev Sources" },
  { href: "CashFlow", label: "Cash Flow" },
  { href: "DocumentProcessing", label: "Document Processing" },
  { href: "DocumentManagement", label: "Document Management" },
  { href: "AICampaigns", label: "AI Campaigns" },
  { href: "Employees", label: "Employees" },
  { href: "Reports", label: "Reports" },
  { href: "Integrations", label: "Integrations" },
  { href: "Workflows", label: "Workflows" },
  { href: "PaymentPortal", label: "Payment Portal" },
  { href: "Utilities", label: "Utilities" },
  { href: "ClientOnboarding", label: "Client Onboarding" },
];

/**
 * Secondary navigation items (documentation, tools, etc.)
 */
export const secondaryNavItems = [
  { href: "WorkflowGuide", label: "Workflow Guide" },
  { href: "Documentation", label: "Documentation" },
  { href: "Agent", label: "AI Agent", isAvatar: true },
  { href: "ClientRequirements", label: "Client Requirements" },
];

/**
 * Map page names to their corresponding module IDs
 * Used for checking if a module is enabled/disabled
 */
export const moduleMapping = {
  Dashboard: "dashboard",
  Contacts: "contacts",
  Accounts: "accounts",
  Leads: "leads",
  Opportunities: "opportunities",
  Activities: "activities",
  Calendar: "calendar",
  BizDevSources: "bizdev_sources",
  CashFlow: "cash_flow",
  DocumentProcessing: "document_processing",
  DocumentManagement: "document_processing",
  Employees: "employees",
  Reports: "reports",
  Integrations: "integrations",
  PaymentPortal: "payment_portal",
  AICampaigns: "ai_campaigns",
  Agent: "ai_agent",
  Utilities: "utilities",
  ClientOnboarding: "client_onboarding",
  Workflows: "workflows",
  DuplicateContacts: null,
  DuplicateAccounts: null,
  DuplicateLeads: null,
  Tenants: null,
  Settings: null,
  Documentation: null,
  AuditLog: null,
  UnitTests: null,
  WorkflowGuide: null,
  ClientRequirements: null,
};

/**
 * Pages that don't require CRM access
 * These pages are accessible even when user.crm_access is false
 */
export const pagesAllowedWithoutCRM = new Set([
  "Documentation",
  "Agent",
  "Settings",
  "AuditLog",
  "UnitTests",
  "WorkflowGuide",
  "ClientRequirements",
  "Workflows",
]);

/**
 * System pages accessible to admins and superadmins only
 */
export const systemPages = new Set([
  "Documentation",
  "AuditLog",
  "Tenants",
  "Agent",
  "UnitTests",
  "WorkflowGuide",
  "ClientRequirements",
  "Workflows",
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
    "Settings",
    "Tenants",
    "AuditLog",
    "UnitTests",
    "DataDiagnostics",
    "TenantDataDebug",
    "DuplicateContacts",
    "DuplicateAccounts",
    "DuplicateLeads",
    "DataQualityReport",
  ];
}
