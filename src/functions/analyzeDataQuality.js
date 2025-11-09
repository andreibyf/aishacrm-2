/**
 * Local implementation of analyzeDataQuality
 * Analyzes data quality across different entity types
 */

import { Contact, Lead, Opportunity, Account, Activity } from '../api/entities.js';

export async function analyzeDataQuality({ tenant_id }) {
  try {
    if (!tenant_id) {
      return {
        status: 'error',
        message: 'tenant_id is required',
        data: null
      };
    }

    // Fetch all entities for the tenant
    const filter = { tenant_id, is_test_data: false };
    
    const [contacts, leads, opportunities, accounts] = await Promise.all([
      Contact.filter(filter).catch(() => []),
      Lead.filter(filter).catch(() => []),
      Opportunity.filter(filter).catch(() => []),
      Account.filter(filter).catch(() => []),
    ]);

    // Analyze contacts
    const contactsAnalysis = analyzeEntity(contacts, 'contact', [
      'first_name',
      'last_name',
      'email'
    ]);

    // Analyze accounts
    const accountsAnalysis = analyzeEntity(accounts, 'account', [
      'name'
    ]);

    // Analyze leads
    const leadsAnalysis = analyzeEntity(leads, 'lead', [
      'name',
      'email'
    ]);

    // Analyze opportunities
    const opportunitiesAnalysis = analyzeEntity(opportunities, 'opportunity', [
      'name',
      'stage'
    ]);

    return {
      status: 'success',
      data: {
        report: {
          contacts: contactsAnalysis,
          accounts: accountsAnalysis,
          leads: leadsAnalysis,
          opportunities: opportunitiesAnalysis,
        }
      }
    };
  } catch (error) {
    console.error('analyzeDataQuality error:', error);
    return {
      status: 'error',
      message: error.message,
      data: {
        report: {
          contacts: createEmptyAnalysis(),
          accounts: createEmptyAnalysis(),
          leads: createEmptyAnalysis(),
          opportunities: createEmptyAnalysis(),
        }
      }
    };
  }
}

function analyzeEntity(records, entityType, requiredFields) {
  if (!records || records.length === 0) {
    return createEmptyAnalysis();
  }

  const issues = [];
  let totalIssues = 0;

  records.forEach((record, index) => {
    const recordIssues = [];

    // Check required fields
    requiredFields.forEach(field => {
      if (!record[field] || (typeof record[field] === 'string' && record[field].trim() === '')) {
        recordIssues.push(`Missing ${field}`);
      }
    });

    // Check email format if email field exists
    if (record.email && typeof record.email === 'string' && record.email.trim()) {
      if (!isValidEmail(record.email)) {
        recordIssues.push('Invalid email format');
      }
    }

    if (recordIssues.length > 0) {
      totalIssues++;
      issues.push({
        id: record.id || `${entityType}-${index}`,
        type: entityType,
        severity: recordIssues.length > 2 ? 'high' : 'medium',
        description: recordIssues.join(', '),
        record: {
          id: record.id,
          name: record.name || record.first_name || record.email || 'Unknown',
        }
      });
    }
  });

  const issuesPercentage = records.length > 0 
    ? Math.round((totalIssues / records.length) * 100) 
    : 0;

  return {
    total: records.length,
    with_issues: totalIssues,
    issues_percentage: issuesPercentage,
    issues: issues.slice(0, 50), // Limit to 50 issues for performance
  };
}

function createEmptyAnalysis() {
  return {
    total: 0,
    with_issues: 0,
    issues_percentage: 0,
    issues: [],
  };
}

function isValidEmail(email) {
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
