// src/lib/validationEngine.ts
//
// Task 2.4 – Smart Field Validation
// A centralized, declarative validation engine for CRM entities.
// Pure functions only – no DOM, no framework hooks.

export type FieldType =
  | 'string'
  | 'email'
  | 'phone'
  | 'number'
  | 'currency'
  | 'date'
  | 'enum';

export interface ValidationRule {
  field: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp | string;
  enumValues?: Array<string | number>;
  /**
   * Optional custom validator for cross-field or complex logic.
   * Return a string (error message) to indicate failure, or null/undefined if valid.
   */
  custom?: (value: unknown, record: Record<string, unknown>) => string | null | undefined;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationOptions {
  /**
   * If true, stops on first error per field.
   */
  stopAtFirstFieldError?: boolean;
}

function normalizePattern(pattern?: RegExp | string | null): RegExp | null {
  if (!pattern) return null;
  if (pattern instanceof RegExp) return pattern;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function defaultLabel(field: string, label?: string): string {
  if (label) return label;
  return field.replace(/_/g, ' ');
}

function validateRequired(
  value: unknown,
  field: string,
  label?: string,
): ValidationError | null {
  const str = value == null ? '' : String(value).trim();
  if (!str) {
    return {
      field,
      code: 'required',
      message: `${defaultLabel(field, label)} is required.`,
    };
  }
  return null;
}

function validateType(
  value: unknown,
  rule: ValidationRule,
): ValidationError | null {
  const { field, label, type } = rule;
  if (value == null || value === '') return null; // already covered by required

  const str = String(value).trim();

  switch (type) {
    case 'email': {
      // Simple email heuristic; backend can enforce stricter rules
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(str)) {
        return {
          field,
          code: 'invalid_email',
          message: `${defaultLabel(field, label)} must be a valid email address.`,
        };
      }
      break;
    }
    case 'phone': {
      // Very loose: digits + optional separators, at least 7 digits total
      const digits = str.replace(/\D/g, '');
      if (digits.length < 7) {
        return {
          field,
          code: 'invalid_phone',
          message: `${defaultLabel(field, label)} must be a valid phone number.`,
        };
      }
      break;
    }
    case 'number':
    case 'currency': {
      const num = Number(str);
      if (!Number.isFinite(num)) {
        return {
          field,
          code: 'invalid_number',
          message: `${defaultLabel(field, label)} must be a valid number.`,
        };
      }
      break;
    }
    case 'date': {
      const time = Date.parse(str);
      if (Number.isNaN(time)) {
        return {
          field,
          code: 'invalid_date',
          message: `${defaultLabel(field, label)} must be a valid date.`,
        };
      }
      break;
    }
    case 'enum': {
      // handled below using enumValues
      break;
    }
    case 'string':
    default:
      // Nothing special to enforce
      break;
  }

  return null;
}

function validateLengths(
  value: unknown,
  rule: ValidationRule,
): ValidationError | null {
  const { field, label, minLength, maxLength } = rule;
  if (value == null || value === '') return null;

  const str = String(value);
  if (typeof minLength === 'number' && str.length < minLength) {
    return {
      field,
      code: 'min_length',
      message: `${defaultLabel(field, label)} must be at least ${minLength} characters.`,
    };
  }

  if (typeof maxLength === 'number' && str.length > maxLength) {
    return {
      field,
      code: 'max_length',
      message: `${defaultLabel(field, label)} must be at most ${maxLength} characters.`,
    };
  }

  return null;
}

function validatePattern(
  value: unknown,
  rule: ValidationRule,
): ValidationError | null {
  const { field, label, pattern } = rule;
  if (!pattern || value == null || value === '') return null;

  const regex = normalizePattern(pattern);
  if (!regex) return null;

  const str = String(value);
  if (!regex.test(str)) {
    return {
      field,
      code: 'pattern_mismatch',
      message: `${defaultLabel(field, label)} is not in the required format.`,
    };
  }

  return null;
}

function validateEnum(
  value: unknown,
  rule: ValidationRule,
): ValidationError | null {
  const { field, label, enumValues, type } = rule;
  if (type !== 'enum' || !enumValues || !enumValues.length) return null;
  if (value == null || value === '') return null;

  if (!enumValues.includes(value as never)) {
    return {
      field,
      code: 'invalid_enum_value',
      message: `${defaultLabel(field, label)} must be one of: ${enumValues.join(', ')}.`,
    };
  }

  return null;
}

function runCustom(
  value: unknown,
  rule: ValidationRule,
  record: Record<string, unknown>,
): ValidationError | null {
  if (typeof rule.custom !== 'function') return null;
  const message = rule.custom(value, record);
  if (!message) return null;

  return {
    field: rule.field,
    code: 'custom',
    message,
  };
}

/**
 * Validate a single field value against a rule.
 * Useful for step-by-step form validation.
 */
export function validateField(
  value: unknown,
  rule: ValidationRule,
  record: Record<string, unknown> = {},
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rule.required) {
    const err = validateRequired(value, rule.field, rule.label);
    if (err) errors.push(err);
  }

  const typeErr = validateType(value, rule);
  if (typeErr) errors.push(typeErr);

  const lenErr = validateLengths(value, rule);
  if (lenErr) errors.push(lenErr);

  const patternErr = validatePattern(value, rule);
  if (patternErr) errors.push(patternErr);

  const enumErr = validateEnum(value, rule);
  if (enumErr) errors.push(enumErr);

  const customErr = runCustom(value, rule, record);
  if (customErr) errors.push(customErr);

  return errors;
}

/**
 * Validate a full record against an array of rules.
 */
export function validateRecord(
  record: Record<string, unknown>,
  rules: ValidationRule[],
  options: ValidationOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const { stopAtFirstFieldError = false } = options;

  for (const rule of rules) {
    const value = record[rule.field];
    const fieldErrors = validateField(value, rule, record);

    if (fieldErrors.length) {
      errors.push(...fieldErrors);
      if (stopAtFirstFieldError) {
        // short-circuit on first field error if requested
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
