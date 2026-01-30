/**
 * Entity Labels Utilities and Constants
 * 
 * Non-React utilities and constants extracted from EntityLabelsContext
 * to fix react-refresh/only-export-components warnings.
 */

export const DEFAULT_LABELS = {
  leads: { plural: 'Leads', singular: 'Lead' },
  contacts: { plural: 'Contacts', singular: 'Contact' },
  accounts: { plural: 'Accounts', singular: 'Account' },
  opportunities: { plural: 'Opportunities', singular: 'Opportunity' },
  activities: { plural: 'Activities', singular: 'Activity' },
  bizdev_sources: { plural: 'Sources', singular: 'Source' },
  workers: { plural: 'Workers', singular: 'Worker' },
};

export const ENTITY_KEY_TO_HREF = {
  leads: 'Leads',
  contacts: 'Contacts',
  accounts: 'Accounts',
  opportunities: 'Opportunities',
  activities: 'Activities',
  bizdev_sources: 'BizDevSources',
  workers: 'Workers',
};

// Reverse mapping: href to entity key
export const HREF_TO_ENTITY_KEY = Object.fromEntries(
  Object.entries(ENTITY_KEY_TO_HREF).map(([key, href]) => [href, key])
);