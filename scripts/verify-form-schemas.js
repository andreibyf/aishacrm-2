#!/usr/bin/env node

/**
 * Form Schema Verification Tool
 * 
 * Checks that all form components have matching database schemas
 * and identifies required fields vs optional fields
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database schema mappings from migration files
const DATABASE_SCHEMAS = {
  accounts: {
    table: 'accounts',
    required: ['tenant_id', 'name'],
    optional: ['account_type', 'industry', 'company_size', 'revenue', 'website', 'phone', 'email', 
               'address', 'city', 'state', 'zip', 'country', 'description', 'status', 'lead_source',
               'owner_id', 'assigned_to', 'parent_account_id', 'account_health', 'health_score',
               'health_reason', 'last_contact_date', 'next_follow_up', 'tags', 'custom_fields', 
               'metadata', 'is_test_data', 'notes'],
    migration: '009_complete_schema.sql'
  },
  
  leads: {
    table: 'leads',
    required: ['tenant_id'],
    optional: ['first_name', 'last_name', 'email', 'phone', 'company', 'title', 'lead_source',
               'status', 'rating', 'industry', 'estimated_value', 'notes', 'assigned_to',
               'next_follow_up', 'last_contact_date', 'converted_to_opportunity', 
               'converted_date', 'lost_reason', 'tags', 'metadata', 'is_test_data'],
    migration: '009_complete_schema.sql'
  },
  
  opportunities: {
    table: 'opportunities',
    required: ['tenant_id', 'name'],
    optional: ['account_id', 'amount', 'close_date', 'stage', 'probability', 'type',
               'lead_source', 'description', 'next_step', 'assigned_to', 'contact_id',
               'campaign_id', 'forecast_category', 'is_closed', 'is_won', 'closed_date',
               'lost_reason', 'tags', 'custom_fields', 'metadata', 'is_test_data'],
    migration: '009_complete_schema.sql'
  },
  
  contacts: {
    table: 'contacts',
    required: ['tenant_id'],
    optional: ['first_name', 'last_name', 'email', 'phone', 'mobile', 'title', 'department',
               'account_id', 'lead_source', 'status', 'owner_id', 'assistant', 
               'assistant_phone', 'birthdate', 'description', 'do_not_call', 'email_opt_out',
               'reports_to', 'mailing_address', 'mailing_city', 'mailing_state', 
               'mailing_zip', 'mailing_country', 'other_address', 'other_city', 'other_state',
               'other_zip', 'other_country', 'last_contact_date', 'next_follow_up',
               'tags', 'metadata', 'is_test_data'],
    migration: '009_complete_schema.sql'
  },
  
  activities: {
    table: 'activities',
    required: ['tenant_id', 'subject', 'activity_type'],
    optional: ['related_to_type', 'related_to_id', 'status', 'priority', 'due_date',
               'start_date', 'end_date', 'description', 'assigned_to', 'completed_date',
               'duration_minutes', 'location', 'outcome', 'tags', 'metadata', 'is_test_data'],
    migration: '009_complete_schema.sql'
  },
  
  cash_flow: {
    table: 'cash_flow',
    required: ['tenant_id', 'transaction_date', 'amount', 'type'],
    optional: ['category', 'description', 'account_id', 'metadata'],
    migration: '009_complete_schema.sql',
    notes: 'Frontend uses "transaction_type" but backend expects "type"'
  },
  
  employees: {
    table: 'employees',
    required: ['tenant_id', 'email'],
    optional: ['first_name', 'last_name', 'phone', 'mobile', 'department', 'title',
               'employee_role', 'hire_date', 'manager_id', 'status', 'notes',
               'user_id', 'metadata', 'is_test_data'],
    migration: '009_complete_schema.sql'
  },
  
  bizdev_sources: {
    table: 'bizdev_sources',
    required: ['tenant_id', 'name', 'source_type'],
    optional: ['url', 'description', 'status', 'priority', 'tags', 'last_checked',
               'check_frequency_days', 'assigned_to', 'notes', 'metadata', 'is_test_data'],
    migration: '009_complete_schema.sql'
  },
  
  webhooks: {
    table: 'webhooks',
    required: ['tenant_id', 'url', 'event_type'],
    optional: ['name', 'description', 'is_active', 'secret', 'headers', 'retry_config', 'metadata'],
    migration: '009_complete_schema.sql'
  }
};

// Form component mappings
const FORM_COMPONENTS = {
  'AccountForm.jsx': 'accounts',
  'LeadForm.jsx': 'leads',
  'OpportunityForm.jsx': 'opportunities',
  'ContactForm.jsx': 'contacts',
  'ActivityForm.jsx': 'activities',
  'CashFlowForm.jsx': 'cash_flow',
  'EmployeeForm.jsx': 'employees',
  'BizDevSourceForm.jsx': 'bizdev_sources',
  'WebhookForm.jsx': 'webhooks'
};

/**
 * Extract form fields from a JSX component
 */
function extractFormFields(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fields = [];
  
  // Match input fields with name/id attributes
  const inputPattern = /<(?:Input|Textarea|select)[^>]*(?:name|id)=["']([^"']+)["'][^>]*(?:required)?/gi;
  let match;
  
  while ((match = inputPattern.exec(content)) !== null) {
    const fieldName = match[1];
    const isRequired = match[0].includes('required');
    fields.push({ name: fieldName, required: isRequired });
  }
  
  // Also check for formData state initialization
  const formDataPattern = /setFormData\(\{([^}]+)\}\)/s;
  const formDataMatch = content.match(formDataPattern);
  
  if (formDataMatch) {
    const formDataFields = formDataMatch[1].match(/(\w+):/g);
    if (formDataFields) {
      formDataFields.forEach(field => {
        const fieldName = field.replace(':', '');
        if (!fields.find(f => f.name === fieldName)) {
          fields.push({ name: fieldName, required: false });
        }
      });
    }
  }
  
  return fields;
}

/**
 * Verify a single form component
 */
function verifyForm(formFile, schemaKey) {
  const schema = DATABASE_SCHEMAS[schemaKey];
  if (!schema) {
    return { error: `No schema found for ${schemaKey}` };
  }
  
  // Handle special cases for form paths
  let actualPath;
  if (formFile === 'BizDevSourceForm.jsx') {
    actualPath = path.join(__dirname, '..', 'src', 'components', 'bizdev', formFile);
  } else if (formFile === 'CashFlowForm.jsx') {
    actualPath = path.join(__dirname, '..', 'src', 'components', 'cashflow', formFile);
  } else if (formFile === 'WebhookForm.jsx') {
    actualPath = path.join(__dirname, '..', 'src', 'components', 'settings', formFile);
  } else if (formFile === 'ActivityForm.jsx') {
    actualPath = path.join(__dirname, '..', 'src', 'components', 'activities', formFile);
  } else if (formFile === 'OpportunityForm.jsx') {
    actualPath = path.join(__dirname, '..', 'src', 'components', 'opportunities', formFile);
  } else {
    const folderName = formFile.replace('Form.jsx', '').toLowerCase() + 's';
    actualPath = path.join(__dirname, '..', 'src', 'components', folderName, formFile);
  }
  
  if (!fs.existsSync(actualPath)) {
    return { error: `Form file not found: ${actualPath}` };
  }
  
  const formFields = extractFormFields(actualPath);
  const allDbFields = [...schema.required, ...schema.optional];
  
  // Check for missing required fields
  const missingRequired = schema.required.filter(req => 
    !formFields.find(f => f.name === req)
  );
  
  // Check for fields in form but not in schema
  const extraFields = formFields
    .filter(f => !allDbFields.includes(f.name) && f.name !== 'tenant_id')
    .map(f => f.name);
  
  // Check for fields marked required in form but optional in DB
  const incorrectRequired = formFields
    .filter(f => f.required && schema.optional.includes(f.name))
    .map(f => f.name);
  
  // Check for required DB fields not marked required in form
  const shouldBeRequired = schema.required
    .filter(req => {
      const field = formFields.find(f => f.name === req);
      return field && !field.required;
    });
  
  return {
    formFile,
    schemaKey,
    table: schema.table,
    formFields: formFields.length,
    dbRequired: schema.required.length,
    dbOptional: schema.optional.length,
    missingRequired,
    extraFields,
    incorrectRequired,
    shouldBeRequired,
    notes: schema.notes
  };
}

/**
 * Main verification
 */
function main() {
  console.log('🔍 Form Schema Verification\n');
  console.log('=' .repeat(80));
  
  let totalIssues = 0;
  const results = [];
  
  for (const [formFile, schemaKey] of Object.entries(FORM_COMPONENTS)) {
    const result = verifyForm(formFile, schemaKey);
    results.push(result);
    
    if (result.error) {
      console.log(`\n❌ ${formFile}: ${result.error}`);
      totalIssues++;
      continue;
    }
    
    const hasIssues = result.missingRequired.length > 0 || 
                      result.extraFields.length > 0 || 
                      result.incorrectRequired.length > 0 ||
                      result.shouldBeRequired.length > 0;
    
    const icon = hasIssues ? '⚠️ ' : '✅';
    console.log(`\n${icon} ${formFile} → ${result.table}`);
    console.log(`   Form fields: ${result.formFields}, DB required: ${result.dbRequired}, DB optional: ${result.dbOptional}`);
    
    if (result.notes) {
      console.log(`   📝 Note: ${result.notes}`);
    }
    
    if (result.missingRequired.length > 0) {
      console.log(`   ❌ Missing required fields: ${result.missingRequired.join(', ')}`);
      totalIssues++;
    }
    
    if (result.shouldBeRequired.length > 0) {
      console.log(`   ⚠️  Should be marked required: ${result.shouldBeRequired.join(', ')}`);
      totalIssues++;
    }
    
    if (result.extraFields.length > 0) {
      console.log(`   ℹ️  Extra fields (not in DB): ${result.extraFields.join(', ')}`);
    }
    
    if (result.incorrectRequired.length > 0) {
      console.log(`   ⚠️  Marked required but optional in DB: ${result.incorrectRequired.join(', ')}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Summary: ${totalIssues} issue(s) found across ${results.length} forms`);
  
  if (totalIssues === 0) {
    console.log('✅ All forms match their database schemas!');
  } else {
    console.log('⚠️  Please review the issues above and update forms accordingly.');
  }
  
  // Generate markdown report
  const reportPath = path.join(__dirname, '..', 'docs', 'FORM_SCHEMA_VERIFICATION.md');
  generateMarkdownReport(results, reportPath);
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(results, outputPath) {
  let markdown = '# Form Schema Verification Report\n\n';
  markdown += `Generated: ${new Date().toISOString()}\n\n`;
  markdown += '## Summary\n\n';
  markdown += '| Form Component | Database Table | Status | Issues |\n';
  markdown += '|---------------|----------------|--------|--------|\n';
  
  for (const result of results) {
    if (result.error) {
      markdown += `| ${result.formFile} | - | ❌ Error | ${result.error} |\n`;
      continue;
    }
    
    const hasIssues = result.missingRequired.length > 0 || 
                      result.extraFields.length > 0 || 
                      result.shouldBeRequired.length > 0;
    const status = hasIssues ? '⚠️ Issues' : '✅ OK';
    const issueCount = result.missingRequired.length + result.extraFields.length + result.shouldBeRequired.length;
    markdown += `| ${result.formFile} | ${result.table} | ${status} | ${issueCount} |\n`;
  }
  
  markdown += '\n## Detailed Analysis\n\n';
  
  for (const result of results) {
    if (result.error) continue;
    
    markdown += `### ${result.formFile}\n\n`;
    markdown += `**Database Table:** \`${result.table}\`\n\n`;
    markdown += `**Form Fields:** ${result.formFields} | **DB Required:** ${result.dbRequired} | **DB Optional:** ${result.dbOptional}\n\n`;
    
    if (result.notes) {
      markdown += `> **Note:** ${result.notes}\n\n`;
    }
    
    if (result.missingRequired.length > 0) {
      markdown += '#### ❌ Missing Required Fields\n\n';
      markdown += 'These fields are required in the database but missing from the form:\n\n';
      result.missingRequired.forEach(field => {
        markdown += `- \`${field}\`\n`;
      });
      markdown += '\n';
    }
    
    if (result.shouldBeRequired.length > 0) {
      markdown += '#### ⚠️ Should Be Marked Required\n\n';
      markdown += 'These fields are required in the database but not marked as required in the form:\n\n';
      result.shouldBeRequired.forEach(field => {
        markdown += `- \`${field}\`\n`;
      });
      markdown += '\n';
    }
    
    if (result.extraFields.length > 0) {
      markdown += '#### ℹ️ Extra Fields\n\n';
      markdown += 'These fields exist in the form but not in the database schema:\n\n';
      result.extraFields.forEach(field => {
        markdown += `- \`${field}\`\n`;
      });
      markdown += '\n';
    }
    
    if (result.incorrectRequired.length > 0) {
      markdown += '#### ⚠️ Incorrectly Marked Required\n\n';
      markdown += 'These fields are marked as required in the form but are optional in the database:\n\n';
      result.incorrectRequired.forEach(field => {
        markdown += `- \`${field}\`\n`;
      });
      markdown += '\n';
    }
    
    // Show schema for reference
    markdown += '#### Database Schema\n\n';
    markdown += '**Required Fields:**\n';
    const schema = DATABASE_SCHEMAS[result.schemaKey];
    schema.required.forEach(field => {
      markdown += `- \`${field}\`\n`;
    });
    markdown += '\n**Optional Fields:**\n';
    schema.optional.forEach(field => {
      markdown += `- \`${field}\`\n`;
    });
    markdown += '\n---\n\n';
  }
  
  fs.writeFileSync(outputPath, markdown);
}

// Run verification
main();
