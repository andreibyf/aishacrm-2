/**
 * validateAndImport
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { records, entityType, mapping, fileName, accountLinkColumn } = await req.json();

    if (!records || !Array.isArray(records) || records.length === 0) {
      return Response.json({ 
        error: 'No records provided',
        successCount: 0,
        failCount: 0,
        errors: []
      }, { status: 400 });
    }

    console.log(`📥 Import request: ${records.length} ${entityType} records`);

    // Get tenant_id for validation
    const tenantId = user.role === 'superadmin' && user.selected_tenant_id 
      ? user.selected_tenant_id 
      : user.tenant_id;

    if (!tenantId) {
      return Response.json({ 
        error: 'No tenant_id found for user',
        successCount: 0,
        failCount: 0,
        errors: []
      }, { status: 400 });
    }

    // Get entity class dynamically
    let Entity;
    try {
      switch(entityType) {
        case 'Contact':
          Entity = base44.entities.Contact;
          break;
        case 'Account':
          Entity = base44.entities.Account;
          break;
        case 'Lead':
          Entity = base44.entities.Lead;
          break;
        case 'Opportunity':
          Entity = base44.entities.Opportunity;
          break;
        case 'Activity':
          Entity = base44.entities.Activity;
          break;
        case 'BizDevSource':
          Entity = base44.entities.BizDevSource;
          break;
        default:
          return Response.json({ 
            error: `Unsupported entity type: ${entityType}`,
            successCount: 0,
            failCount: 0,
            errors: []
          }, { status: 400 });
      }
    } catch (err) {
      console.error('Failed to load entity:', err);
      return Response.json({ 
        error: `Failed to load entity: ${err.message}`,
        successCount: 0,
        failCount: 0,
        errors: []
      }, { status: 500 });
    }

    const results = {
      successCount: 0,
      failCount: 0,
      errors: [],
      accountsLinked: 0,
      accountsNotFound: 0,
      matchingDetails: []
    };

    // Process account linking for Contacts if applicable
    let accountLookupMap = {};
    if (entityType === 'Contact' && accountLinkColumn) {
      console.log(`🔗 Processing account links via column: ${accountLinkColumn}`);
      
      // Get all accounts for this tenant
      const accounts = await base44.entities.Account.filter({ tenant_id: tenantId });
      
      // Build lookup map: company name (lowercase) -> account
      accountLookupMap = {};
      accounts.forEach(account => {
        if (account.name) {
          accountLookupMap[account.name.toLowerCase().trim()] = account;
        }
        if (account.legacy_id) {
          accountLookupMap[account.legacy_id.toLowerCase().trim()] = account;
        }
        if (account.id) {
          accountLookupMap[account.id.toLowerCase().trim()] = account;
        }
      });
      
      console.log(`📚 Built account lookup with ${Object.keys(accountLookupMap).length} entries`);
    }

    // Process each record
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + 2; // +2 for header row and 0-index
      
      try {
        // Validate required fields based on entity type
        if (entityType === 'Contact') {
          // Require at least one name field, default the other to 'UNK'
          if (!record.first_name && !record.last_name) {
            results.errors.push({
              row_number: rowNumber,
              error: 'Missing required fields: at least first_name or last_name is required'
            });
            results.failCount++;
            continue;
          }
          // Default missing name to 'UNK'
          if (!record.first_name) record.first_name = 'UNK';
          if (!record.last_name) record.last_name = 'UNK';
        } else if (entityType === 'BizDevSource') {
          if (!record.company_name) {
            results.errors.push({
              row_number: rowNumber,
              error: 'Missing required field: company_name is required'
            });
            results.failCount++;
            continue;
          }
          // Set default source if not provided
          if (!record.source) {
            record.source = fileName || 'CSV Import';
          }
        }

        // Handle account linking for Contacts
        if (entityType === 'Contact' && record._company_name) {
          const companyValue = record._company_name.trim();
          const companyKey = companyValue.toLowerCase();
          
          let matchedAccount = accountLookupMap[companyKey];
          let matchMethod = null;
          
          if (matchedAccount) {
            if (matchedAccount.name && matchedAccount.name.toLowerCase() === companyKey) {
              matchMethod = 'Company Name';
            } else if (matchedAccount.legacy_id && matchedAccount.legacy_id.toLowerCase() === companyKey) {
              matchMethod = 'Legacy ID';
            } else if (matchedAccount.id && matchedAccount.id.toLowerCase() === companyKey) {
              matchMethod = 'Account ID';
            }
          }
          
          if (matchedAccount) {
            record.account_id = matchedAccount.id;
            results.accountsLinked++;
            results.matchingDetails.push({
              rowNumber,
              companyValue,
              matched: true,
              matchMethod
            });
          } else {
            results.accountsNotFound++;
            results.matchingDetails.push({
              rowNumber,
              companyValue,
              matched: false
            });
          }
          
          delete record._company_name;
        }

        // Add tenant_id
        record.tenant_id = tenantId;

        // Create the record
        await Entity.create(record);
        results.successCount++;
        
      } catch (error) {
        console.error(`Row ${rowNumber} failed:`, error);
        results.errors.push({
          row_number: rowNumber,
          error: error.message || 'Unknown error'
        });
        results.failCount++;
      }
    }

    console.log(`✅ Import complete: ${results.successCount} success, ${results.failCount} failed`);
    
    return Response.json(results);

  } catch (error) {
    console.error('❌ validateAndImport error:', error);
    return Response.json({ 
      error: `An unexpected server error occurred: ${error.message}`,
      successCount: 0,
      failCount: 0,
      errors: []
    }, { status: 500 });
  }
});

export default validateAndImport;
