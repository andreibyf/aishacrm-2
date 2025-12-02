// src/lib/validationSchemas.ts
//
// Task 2.4 – Entity validation schemas for AiSHA CRM.
// Each schema defines rules for a core entity; convenience helpers
// delegate to the shared validation engine.

import type { ValidationRule, ValidationResult } from './validationEngine';
import { validateRecord } from './validationEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Lead Validation Schema
// ─────────────────────────────────────────────────────────────────────────────
export const leadValidationSchema: ValidationRule[] = [
  { field: 'first_name', label: 'First Name', required: true, minLength: 1 },
  { field: 'last_name', label: 'Last Name', required: true, minLength: 1 },
  { field: 'email', label: 'Email', required: true, type: 'email' },
  { field: 'phone', label: 'Phone', type: 'phone' },
  { field: 'company', label: 'Company', required: false, minLength: 1 },
  {
    field: 'status',
    label: 'Status',
    type: 'enum',
    enumValues: ['new', 'working', 'qualified', 'unqualified'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Account Validation Schema
// ─────────────────────────────────────────────────────────────────────────────
export const accountValidationSchema: ValidationRule[] = [
  { field: 'name', label: 'Account Name', required: true, minLength: 2 },
  { field: 'website', label: 'Website', required: false, minLength: 3 },
  { field: 'email', label: 'Email', type: 'email' },
  { field: 'phone', label: 'Phone', type: 'phone' },
  {
    field: 'industry',
    label: 'Industry',
    type: 'string',
    minLength: 2,
  },
  {
    field: 'annual_revenue',
    label: 'Annual Revenue',
    type: 'currency',
    custom: (value) => {
      if (value == null || value === '') return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        return 'Annual revenue must be a non-negative number.';
      }
      return null;
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Contact Validation Schema
// ─────────────────────────────────────────────────────────────────────────────
export const contactValidationSchema: ValidationRule[] = [
  { field: 'first_name', label: 'First Name', required: true, minLength: 1 },
  { field: 'last_name', label: 'Last Name', required: true, minLength: 1 },
  { field: 'email', label: 'Email', required: true, type: 'email' },
  { field: 'phone', label: 'Phone', type: 'phone' },
  { field: 'job_title', label: 'Job Title', required: false, minLength: 2 },
  { field: 'department', label: 'Department', required: false, minLength: 2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity Validation Schema
// ─────────────────────────────────────────────────────────────────────────────
export const opportunityValidationSchema: ValidationRule[] = [
  { field: 'name', label: 'Opportunity Name', required: true, minLength: 2 },
  {
    field: 'amount',
    label: 'Amount',
    type: 'currency',
    required: true,
    custom: (value) => {
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) {
        return 'Amount must be greater than 0.';
      }
      return null;
    },
  },
  {
    field: 'stage',
    label: 'Stage',
    type: 'enum',
    enumValues: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
    required: true,
  },
  {
    field: 'probability',
    label: 'Probability',
    type: 'number',
    custom: (value) => {
      if (value == null || value === '') return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        return 'Probability must be between 0 and 100.';
      }
      return null;
    },
  },
  {
    field: 'close_date',
    label: 'Close Date',
    type: 'date',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Activity Validation Schema
// ─────────────────────────────────────────────────────────────────────────────
export const activityValidationSchema: ValidationRule[] = [
  {
    field: 'type',
    label: 'Activity Type',
    type: 'enum',
    enumValues: ['call', 'email', 'meeting', 'task', 'note'],
    required: true,
  },
  { field: 'subject', label: 'Subject', required: true, minLength: 3 },
  { field: 'description', label: 'Description', required: false },
  {
    field: 'due_date',
    label: 'Due Date',
    type: 'date',
  },
  { field: 'assigned_to', label: 'Assigned To', required: false },
  {
    field: 'status',
    label: 'Status',
    type: 'enum',
    enumValues: ['pending', 'in_progress', 'completed', 'cancelled'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ─────────────────────────────────────────────────────────────────────────────

export function validateLead(record: Record<string, unknown>): ValidationResult {
  return validateRecord(record, leadValidationSchema);
}

export function validateAccount(record: Record<string, unknown>): ValidationResult {
  return validateRecord(record, accountValidationSchema);
}

export function validateContact(record: Record<string, unknown>): ValidationResult {
  return validateRecord(record, contactValidationSchema);
}

export function validateOpportunity(record: Record<string, unknown>): ValidationResult {
  return validateRecord(record, opportunityValidationSchema);
}

export function validateActivity(record: Record<string, unknown>): ValidationResult {
  return validateRecord(record, activityValidationSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema registry for dynamic lookups (useful for conversational forms)
// ─────────────────────────────────────────────────────────────────────────────

export const validationSchemaRegistry: Record<string, ValidationRule[]> = {
  lead: leadValidationSchema,
  leads: leadValidationSchema,
  account: accountValidationSchema,
  accounts: accountValidationSchema,
  contact: contactValidationSchema,
  contacts: contactValidationSchema,
  opportunity: opportunityValidationSchema,
  opportunities: opportunityValidationSchema,
  activity: activityValidationSchema,
  activities: activityValidationSchema,
};

export const validatorRegistry: Record<string, (record: Record<string, unknown>) => ValidationResult> = {
  lead: validateLead,
  leads: validateLead,
  account: validateAccount,
  accounts: validateAccount,
  contact: validateContact,
  contacts: validateContact,
  opportunity: validateOpportunity,
  opportunities: validateOpportunity,
  activity: validateActivity,
  activities: validateActivity,
};

/**
 * Validate any entity by name.
 * Returns null if entity type is not recognized.
 */
export function validateEntity(
  entityType: string,
  record: Record<string, unknown>,
): ValidationResult | null {
  const validator = validatorRegistry[entityType.toLowerCase()];
  if (!validator) return null;
  return validator(record);
}
