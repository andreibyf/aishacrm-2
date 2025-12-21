// src/lib/__tests__/validationEngine.test.ts
//
// NOTE:
// This suite intentionally tests ONLY pure validation functions.
// We avoid React / jsdom interactions here because click-based
// tests have caused Vitest worker crashes in this project.
//
// Task 2.4 – Smart Field Validation

import { describe, expect, it } from 'vitest';
import {
  validateRecord,
  validateField,
  type ValidationRule,
} from '../validationEngine';
import {
  validateLead,
  validateAccount,
  validateContact,
  validateOpportunity,
  validateActivity,
  validateEntity,
} from '../validationSchemas';

// ─────────────────────────────────────────────────────────────────────────────
// Core validation engine tests
// ─────────────────────────────────────────────────────────────────────────────
describe('validationEngine – core rules', () => {
  describe('required rule', () => {
    it('marks required field as invalid when missing', () => {
      const rules: ValidationRule[] = [
        { field: 'name', required: true },
      ];

      const result = validateRecord({}, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatchObject({
        field: 'name',
        code: 'required',
      });
    });

    it('marks required field as invalid when empty string', () => {
      const rules: ValidationRule[] = [
        { field: 'name', required: true },
      ];

      const result = validateRecord({ name: '   ' }, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('required');
    });

    it('passes when required field has value', () => {
      const rules: ValidationRule[] = [
        { field: 'name', required: true },
      ];

      const result = validateRecord({ name: 'Test' }, rules);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('email type', () => {
    it('accepts a valid email', () => {
      const rules: ValidationRule[] = [
        { field: 'email', required: true, type: 'email' },
      ];

      const result = validateRecord({ email: 'user@example.com' }, rules);

      expect(result.valid).toBe(true);
    });

    it('rejects invalid email formats', () => {
      const rules: ValidationRule[] = [
        { field: 'email', required: true, type: 'email' },
      ];

      const testCases = ['not-an-email', 'missing@domain', '@nodomain.com', 'spaces in@email.com'];

      for (const email of testCases) {
        const result = validateRecord({ email }, rules);
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toMatchObject({
          field: 'email',
          code: 'invalid_email',
        });
      }
    });
  });

  describe('phone type', () => {
    it('accepts valid phone numbers', () => {
      const rules: ValidationRule[] = [
        { field: 'phone', type: 'phone' },
      ];

      const validPhones = ['555-123-4567', '(555) 123-4567', '+1 555 123 4567', '5551234567'];

      for (const phone of validPhones) {
        const result = validateRecord({ phone }, rules);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects phone numbers with too few digits', () => {
      const rules: ValidationRule[] = [
        { field: 'phone', type: 'phone' },
      ];

      const result = validateRecord({ phone: '123456' }, rules); // only 6 digits

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('invalid_phone');
    });
  });

  describe('number and currency types', () => {
    it('accepts valid numbers', () => {
      const rules: ValidationRule[] = [
        { field: 'amount', type: 'number' },
      ];

      const result = validateRecord({ amount: '12345.67' }, rules);
      expect(result.valid).toBe(true);
    });

    it('rejects non-numeric values', () => {
      const rules: ValidationRule[] = [
        { field: 'amount', type: 'currency' },
      ];

      const result = validateRecord({ amount: 'not-a-number' }, rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('invalid_number');
    });
  });

  describe('date type', () => {
    it('accepts valid date formats', () => {
      const rules: ValidationRule[] = [
        { field: 'due_date', type: 'date' },
      ];

      const validDates = ['2024-01-15', '2024-12-31T23:59:59Z', 'January 1, 2024'];

      for (const due_date of validDates) {
        const result = validateRecord({ due_date }, rules);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects invalid date strings', () => {
      const rules: ValidationRule[] = [
        { field: 'due_date', type: 'date' },
      ];

      const result = validateRecord({ due_date: 'not-a-date' }, rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('invalid_date');
    });
  });

  describe('minLength and maxLength', () => {
    it('enforces minLength on string fields', () => {
      const rules: ValidationRule[] = [
        { field: 'code', minLength: 3 },
      ];

      const tooShort = validateRecord({ code: 'ab' }, rules);
      const ok = validateRecord({ code: 'abc' }, rules);

      expect(tooShort.valid).toBe(false);
      expect(tooShort.errors[0].code).toBe('min_length');

      expect(ok.valid).toBe(true);
    });

    it('enforces maxLength on string fields', () => {
      const rules: ValidationRule[] = [
        { field: 'code', maxLength: 5 },
      ];

      const ok = validateRecord({ code: 'abcde' }, rules);
      const tooLong = validateRecord({ code: 'abcdef' }, rules);

      expect(ok.valid).toBe(true);

      expect(tooLong.valid).toBe(false);
      expect(tooLong.errors[0].code).toBe('max_length');
    });
  });

  describe('pattern rule', () => {
    it('validates against regex pattern', () => {
      const rules: ValidationRule[] = [
        { field: 'zip', pattern: /^\d{5}$/ },
      ];

      const ok = validateRecord({ zip: '12345' }, rules);
      const bad = validateRecord({ zip: '1234' }, rules);

      expect(ok.valid).toBe(true);
      expect(bad.valid).toBe(false);
      expect(bad.errors[0].code).toBe('pattern_mismatch');
    });

    it('accepts string patterns', () => {
      const rules: ValidationRule[] = [
        { field: 'code', pattern: '^[A-Z]{3}$' },
      ];

      const ok = validateRecord({ code: 'ABC' }, rules);
      const bad = validateRecord({ code: 'abc' }, rules);

      expect(ok.valid).toBe(true);
      expect(bad.valid).toBe(false);
    });
  });

  describe('enum rule', () => {
    it('validates enum values', () => {
      const rules: ValidationRule[] = [
        {
          field: 'status',
          type: 'enum',
          enumValues: ['open', 'closed'],
        },
      ];

      const ok = validateRecord({ status: 'open' }, rules);
      const bad = validateRecord({ status: 'pending' }, rules);

      expect(ok.valid).toBe(true);
      expect(bad.valid).toBe(false);
      expect(bad.errors[0].code).toBe('invalid_enum_value');
    });

    it('allows empty values for non-required enums', () => {
      const rules: ValidationRule[] = [
        {
          field: 'status',
          type: 'enum',
          enumValues: ['open', 'closed'],
        },
      ];

      const result = validateRecord({}, rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('custom validator', () => {
    it('runs custom validators for cross-field logic', () => {
      const rules: ValidationRule[] = [
        {
          field: 'end_date',
          type: 'date',
          custom: (_value, record) => {
            const start = record.start_date ? Date.parse(String(record.start_date)) : NaN;
            const end = record.end_date ? Date.parse(String(record.end_date)) : NaN;
            if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
              return 'End date cannot be before start date.';
            }
            return null;
          },
        },
      ];

      const ok = validateRecord(
        { start_date: '2024-01-01', end_date: '2024-01-10' },
        rules,
      );
      const bad = validateRecord(
        { start_date: '2024-01-10', end_date: '2024-01-01' },
        rules,
      );

      expect(ok.valid).toBe(true);
      expect(bad.valid).toBe(false);
      expect(bad.errors[0].message).toContain('End date cannot be before start date');
    });

    it('custom validator receives full record context', () => {
      const rules: ValidationRule[] = [
        {
          field: 'confirm_email',
          custom: (value, record) => {
            if (value !== record.email) {
              return 'Email confirmation must match email.';
            }
            return null;
          },
        },
      ];

      const ok = validateRecord({ email: 'test@example.com', confirm_email: 'test@example.com' }, rules);
      const bad = validateRecord({ email: 'test@example.com', confirm_email: 'different@example.com' }, rules);

      expect(ok.valid).toBe(true);
      expect(bad.valid).toBe(false);
    });
  });

  describe('validateField helper', () => {
    it('validates a single field', () => {
      const rule: ValidationRule = { field: 'email', required: true, type: 'email' };

      const errors = validateField('invalid', rule);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('invalid_email');
    });

    it('returns empty array for valid field', () => {
      const rule: ValidationRule = { field: 'email', required: true, type: 'email' };

      const errors = validateField('valid@example.com', rule);

      expect(errors).toHaveLength(0);
    });
  });

  describe('options', () => {
    it('stopAtFirstFieldError stops after first field with errors', () => {
      const rules: ValidationRule[] = [
        { field: 'a', required: true },
        { field: 'b', required: true },
        { field: 'c', required: true },
      ];

      const result = validateRecord({}, rules, { stopAtFirstFieldError: true });

      // Should only have error for first field
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('a');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity validation schema tests
// ─────────────────────────────────────────────────────────────────────────────
describe('validationSchemas – entity helpers', () => {
  describe('validateLead', () => {
    it('requires first_name, last_name, and valid email', () => {
      const missing = validateLead({});

      expect(missing.valid).toBe(false);
      const fields = missing.errors.map((e) => e.field);
      expect(fields).toContain('first_name');
      expect(fields).toContain('last_name');
      expect(fields).toContain('email');
    });

    it('rejects invalid email', () => {
      const badEmail = validateLead({
        first_name: 'John',
        last_name: 'Doe',
        email: 'nope',
      });

      expect(badEmail.valid).toBe(false);
      expect(badEmail.errors.some((e) => e.code === 'invalid_email')).toBe(true);
    });

    it('accepts valid lead', () => {
      const ok = validateLead({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
      });

      expect(ok.valid).toBe(true);
    });

    it('validates status enum', () => {
      const bad = validateLead({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        status: 'invalid_status',
      });

      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.code === 'invalid_enum_value')).toBe(true);
    });
  });

  describe('validateAccount', () => {
    it('requires name with minimum length', () => {
      const missing = validateAccount({});

      expect(missing.valid).toBe(false);
      expect(missing.errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('rejects negative annual revenue', () => {
      const bad = validateAccount({
        name: 'Test Corp',
        annual_revenue: -1000,
      });

      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.field === 'annual_revenue')).toBe(true);
    });

    it('accepts valid account', () => {
      const ok = validateAccount({
        name: 'Acme Corporation',
        annual_revenue: 1000000,
      });

      expect(ok.valid).toBe(true);
    });
  });

  describe('validateContact', () => {
    it('requires first_name, last_name, and email', () => {
      const missing = validateContact({});

      expect(missing.valid).toBe(false);
      const fields = missing.errors.map((e) => e.field);
      expect(fields).toContain('first_name');
      expect(fields).toContain('last_name');
      expect(fields).toContain('email');
    });

    it('accepts valid contact', () => {
      const ok = validateContact({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane.smith@company.com',
      });

      expect(ok.valid).toBe(true);
    });
  });

  describe('validateOpportunity', () => {
    it('enforces positive amount and valid stage', () => {
      const bad = validateOpportunity({
        name: 'X', // too short (minLength: 2)
        amount: -100,
        stage: 'unknown',
      });

      expect(bad.valid).toBe(false);
      const codes = bad.errors.map((e) => e.code);
      expect(codes).toContain('min_length'); // name too short
      expect(codes).toContain('custom'); // amount <= 0
      expect(codes).toContain('invalid_enum_value'); // stage not allowed
    });

    it('accepts valid opportunity', () => {
      const ok = validateOpportunity({
        name: 'Big Deal',
        amount: 50000,
        stage: 'proposal',
      });

      expect(ok.valid).toBe(true);
    });

    it('validates probability range', () => {
      const tooHigh = validateOpportunity({
        name: 'Deal',
        amount: 1000,
        stage: 'prospecting',
        probability: 150,
      });

      expect(tooHigh.valid).toBe(false);
      expect(tooHigh.errors.some((e) => e.field === 'probability')).toBe(true);
    });
  });

  describe('validateActivity', () => {
    it('requires type and subject', () => {
      const missing = validateActivity({});

      expect(missing.valid).toBe(false);
      const fields = missing.errors.map((e) => e.field);
      expect(fields).toContain('type');
      expect(fields).toContain('subject');
    });

    it('validates activity type enum', () => {
      const bad = validateActivity({
        type: 'invalid_type',
        subject: 'Test activity',
      });

      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.code === 'invalid_enum_value')).toBe(true);
    });

    it('accepts valid activity', () => {
      const ok = validateActivity({
        type: 'call',
        subject: 'Follow-up call with client',
      });

      expect(ok.valid).toBe(true);
    });
  });

  describe('validateEntity helper', () => {
    it('validates entity by name', () => {
      const result = validateEntity('lead', {
        first_name: 'Test',
        last_name: 'User',
        email: 'test@example.com',
      });

      expect(result).not.toBeNull();
      expect(result?.valid).toBe(true);
    });

    it('returns null for unknown entity types', () => {
      const result = validateEntity('unknown_entity', {});

      expect(result).toBeNull();
    });

    it('handles plural entity names', () => {
      const result = validateEntity('accounts', { name: 'Test Account' });

      expect(result).not.toBeNull();
      expect(result?.valid).toBe(true);
    });
  });
});
