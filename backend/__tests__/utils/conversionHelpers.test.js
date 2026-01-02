/**
 * Tests for conversionHelpers.js
 * Unit tests for lead-to-contact conversion utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractPersonDataFromLead,
  buildContactProvenanceMetadata,
  determineConversionAction,
  validateLeadConversion,
  determineContactType
} from '../../utils/conversionHelpers.js';

describe('conversionHelpers', () => {
  describe('extractPersonDataFromLead', () => {
    it('should extract basic person data from a B2C lead', () => {
      const lead = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        job_title: 'Software Engineer'
      };

      const result = extractPersonDataFromLead(lead);

      expect(result).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        job_title: 'Software Engineer'
      });
    });

    it('should extract minimal person data from a B2B lead', () => {
      const lead = {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane.smith@company.com',
        phone: null,
        job_title: null
      };

      const result = extractPersonDataFromLead(lead);

      expect(result).toEqual({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane.smith@company.com',
        phone: null,
        job_title: null
      });
    });

    it('should handle empty lead object', () => {
      const lead = {};
      const result = extractPersonDataFromLead(lead);

      expect(result).toEqual({
        first_name: undefined,
        last_name: undefined,
        email: undefined,
        phone: undefined,
        job_title: undefined
      });
    });
  });

  describe('buildContactProvenanceMetadata', () => {
    it('should build complete provenance metadata for a converted lead', () => {
      const lead = {
        id: 'lead-123',
        lead_type: 'b2c',
        source: 'website',
        status: 'qualified',
        company_name: 'Tech Corp',
        industry: 'Technology',
        website: 'https://techcorp.com',
        industry_license: 'LIC123',
        license_status: 'active',
        metadata: {
          promoted_from_bizdev_id: 'bizdev-456',
          source_origin: 'linkedin',
          batch_id: 'batch-789'
        }
      };

      const result = buildContactProvenanceMetadata(lead);

      expect(result).toEqual({
        converted_from_lead_id: 'lead-123',
        converted_at: expect.any(String), // Timestamp
        converted_from_lead_type: 'b2c',
        lead_source: 'website',
        lead_status: 'qualified',
        bizdev_origin: 'bizdev-456',
        bizdev_source_info: 'linkedin',
        bizdev_batch_id: 'batch-789',
        company_name: 'Tech Corp',
        industry: 'Technology',
        website: 'https://techcorp.com',
        industry_license: 'LIC123',
        license_status: 'active',
        lead_metadata_snapshot: lead.metadata
      });

      // Verify timestamp format
      expect(new Date(result.converted_at).toISOString()).toBe(result.converted_at);
    });

    it('should handle lead without metadata', () => {
      const lead = {
        id: 'lead-456',
        lead_type: 'b2b',
        source: 'referral',
        status: 'new'
      };

      const result = buildContactProvenanceMetadata(lead);

      expect(result.bizdev_origin).toBeUndefined();
      expect(result.bizdev_source_info).toBeUndefined();
      expect(result.bizdev_batch_id).toBeUndefined();
      expect(result.lead_metadata_snapshot).toBeUndefined();
    });

    it('should handle lead with empty metadata', () => {
      const lead = {
        id: 'lead-789',
        metadata: {}
      };

      const result = buildContactProvenanceMetadata(lead);

      expect(result.bizdev_origin).toBeUndefined();
      expect(result.bizdev_source_info).toBeUndefined();
      expect(result.bizdev_batch_id).toBeUndefined();
      expect(result.lead_metadata_snapshot).toEqual({});
    });
  });

  describe('determineConversionAction', () => {
    it('should return default conversion action for any lead status', () => {
      const statuses = ['new', 'qualified', 'contacted', 'converted', 'lost'];

      statuses.forEach(status => {
        const result = determineConversionAction(status);
        expect(result).toEqual({
          mark_as_converted: true,
          new_status: 'converted',
          delete_lead: false,
          archive_lead: false
        });
      });
    });

    it('should preserve lead for audit trail by default', () => {
      const result = determineConversionAction('qualified');
      expect(result.delete_lead).toBe(false);
      expect(result.archive_lead).toBe(false);
      expect(result.mark_as_converted).toBe(true);
    });
  });

  describe('validateLeadConversion', () => {
    it('should validate a complete lead successfully', () => {
      const lead = {
        id: 'lead-123',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        status: 'qualified'
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({ valid: true });
    });

    it('should reject null or undefined lead', () => {
      expect(validateLeadConversion(null)).toEqual({
        valid: false,
        error: 'Lead not found'
      });

      expect(validateLeadConversion(undefined)).toEqual({
        valid: false,
        error: 'Lead not found'
      });
    });

    it('should reject already converted lead', () => {
      const lead = {
        id: 'lead-123',
        status: 'converted',
        first_name: 'John'
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({
        valid: false,
        error: 'Lead already converted to Contact'
      });
    });

    it('should reject lead without any identifier', () => {
      const lead = {
        id: 'lead-123',
        status: 'qualified'
        // No first_name, last_name, or email
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({
        valid: false,
        error: 'Lead must have first_name, last_name, or email'
      });
    });

    it('should accept lead with only first name', () => {
      const lead = {
        id: 'lead-123',
        status: 'qualified',
        first_name: 'John'
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({ valid: true });
    });

    it('should accept lead with only last name', () => {
      const lead = {
        id: 'lead-123',
        status: 'qualified',
        last_name: 'Doe'
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({ valid: true });
    });

    it('should accept lead with only email', () => {
      const lead = {
        id: 'lead-123',
        status: 'qualified',
        email: 'john@example.com'
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({ valid: true });
    });

    it('should accept lead with multiple identifiers', () => {
      const lead = {
        id: 'lead-123',
        status: 'qualified',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com'
      };

      const result = validateLeadConversion(lead);
      expect(result).toEqual({ valid: true });
    });
  });

  describe('determineContactType', () => {
    it('should return b2c for b2c lead type', () => {
      expect(determineContactType('b2c')).toBe('b2c');
    });

    it('should return b2b for b2b lead type', () => {
      expect(determineContactType('b2b')).toBe('b2b');
    });

    it('should return b2b for any other lead type', () => {
      expect(determineContactType('unknown')).toBe('b2b');
      expect(determineContactType('')).toBe('b2b');
      expect(determineContactType(null)).toBe('b2b');
      expect(determineContactType(undefined)).toBe('b2b');
    });
  });
});