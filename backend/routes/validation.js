/**
 * Validation Routes
 * Data quality, duplicates, validation
 * MIGRATED: Added checkDuplicateBeforeCreate and validateAndImport from functions
 */

import express from 'express';
import logger from '../lib/logger.js';
import { invalidateTenantCache } from '../lib/cacheMiddleware.js';

// Helper to normalize strings for duplicate detection
function normalizeString(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

// Helper: dynamic duplicate finder for a given entity and fields (Postgres only)
async function findDuplicatesInDbSupabase(supabase, entityTable, tenantId, fields = []) {
  if (!supabase || !entityTable || !tenantId || fields.length === 0) {
    return { total: 0, groups: [] };
  }

  // Whitelist of allowed columns per entity table
  const allowedColumnsMap = {
    contacts: ['first_name', 'last_name', 'email', 'phone'],
    accounts: ['name', 'industry', 'website'],
    leads: ['first_name', 'last_name', 'email', 'company'],
    opportunities: ['name', 'stage', 'amount'],
    activities: ['type', 'subject', 'date'],
  };
  const allowedColumns = allowedColumnsMap[entityTable] || [];

  // Validate fields against whitelist
  const safeFields = fields.filter((f) => allowedColumns.includes(f));
  if (safeFields.length === 0) {
    return { total: 0, groups: [] };
  }

  // Build GROUP BY key: coalesce each field to empty string to avoid null grouping issues
  const _keyExpr = safeFields
    .map((f) => `COALESCE(${f}::text, '')`)
    .join(` || '|' || `);

  // Fetch a capped set of rows and aggregate in-memory to avoid server-side GROUP BY
  // Safety cap to control payload size
  const CAP = 5000;
  try {
    const { data, error } = await supabase
      .from(entityTable)
      .select([...new Set(['id', 'tenant_id', ...safeFields])].join(','))
      .eq('tenant_id', tenantId)
      .limit(CAP);
    if (error) throw new Error(error.message);
    const map = new Map();
    for (const row of data || []) {
      const key = safeFields.map((f) => String(row[f] ?? '')).join('|');
      const count = (map.get(key) || 0) + 1;
      map.set(key, count);
    }
    const groups = Array.from(map.entries())
      .filter(([_, cnt]) => cnt > 1)
      .map(([key, cnt]) => ({ key, count: cnt }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 200);
    return { total: groups.length, groups };
  } catch {
    return { total: 0, groups: [] };
  }
}

export default function createValidationRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/validation/check-duplicate - Check for duplicate records
  router.get('/check-duplicate', async (req, res) => {
    try {
      const { tenant_id, type, name, email, phone } = req.query;
      
      if (!tenant_id || !type) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and type are required'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const tableMap = {
        account: 'accounts',
        lead: 'leads',
        contact: 'contacts',
        opportunity: 'opportunities'
      };

      const table = tableMap[type];
      if (!table) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid type: ${type}. Valid types: account, lead, contact, opportunity`
        });
      }

      let query = supabase.from(table).select('id, name, email, phone').eq('tenant_id', tenant_id);

      if (name) query = query.ilike('name', `%${name}%`);
      if (email) query = query.eq('email', email);
      if (phone) query = query.eq('phone', phone);

      const { data, error } = await query.limit(10);

      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: {
          has_duplicates: data && data.length > 0,
          count: data?.length || 0,
          duplicates: data || []
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/validation/find-duplicates - Find duplicate records
  router.post('/find-duplicates', async (req, res) => {
    try {
      const { tenant_id, entity_type, fields = [] } = req.body || {};

      if (!entity_type || !tenant_id) {
        return res.status(400).json({ status: 'error', message: 'entity_type and tenant_id are required' });
      }

      // Map entity type to table name (simple pluralization; adjust as needed)
      const tableMap = {
        Contact: 'contacts',
        Account: 'accounts',
        Lead: 'leads',
        Opportunity: 'opportunities',
        Activity: 'activities',
      };
      const table = tableMap[entity_type] || entity_type.toLowerCase();

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const result = await findDuplicatesInDbSupabase(supabase, table, tenant_id, fields);
      res.json({ status: 'success', data: { ...result, fields, tenant_id, entity_type } });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/analyze-data-quality - Analyze data quality
  router.post('/analyze-data-quality', async (req, res) => {
    try {
      const { tenant_id } = req.body || {};

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      // Fetch all data
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const [contactsRes, accountsRes, leadsRes, opportunitiesRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('tenant_id', tenant_id),
        supabase.from('accounts').select('*').eq('tenant_id', tenant_id),
        supabase.from('leads').select('*').eq('tenant_id', tenant_id),
        supabase.from('opportunities').select('*').eq('tenant_id', tenant_id),
      ]);
      const contacts = contactsRes.data || [];
      const accounts = accountsRes.data || [];
      const leads = leadsRes.data || [];
      const opportunities = opportunitiesRes.data || [];

      // Helper to check email validity
      const isValidEmail = (email) => {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      // Helper to check name has invalid characters
      const hasInvalidNameChars = (name) => {
        if (!name) return false;
        // Allow letters, spaces, hyphens, apostrophes, periods
        const invalidRegex = /[^a-zA-Z\s\-'.]/;
        return invalidRegex.test(name);
      };

      // Analyze Contacts
      const contactsData = contacts;
      const contactsIssues = {
        missing_first_name: 0,
        missing_last_name: 0,
        invalid_email: 0,
        missing_contact_info: 0,
        invalid_name_characters: 0,
      };

      contactsData.forEach((contact) => {
        if (!contact.first_name) contactsIssues.missing_first_name++;
        if (!contact.last_name) contactsIssues.missing_last_name++;
        if (contact.email && !isValidEmail(contact.email)) contactsIssues.invalid_email++;
        if (!contact.email && !contact.phone && !contact.mobile) contactsIssues.missing_contact_info++;
        if (hasInvalidNameChars(contact.first_name) || hasInvalidNameChars(contact.last_name)) {
          contactsIssues.invalid_name_characters++;
        }
      });

      const contactsTotal = contactsData.length || 1; // Avoid division by zero
      const contactsIssuesCount = Object.values(contactsIssues).reduce((sum, count) => sum + count, 0);
      const contactsIssuesPercentage = (contactsIssuesCount / contactsTotal) * 100;

      // Analyze Accounts
      const accountsData = accounts;
      const accountsIssues = {
        invalid_email: 0,
        missing_contact_info: 0,
        invalid_name_characters: 0,
      };

      accountsData.forEach((account) => {
        if (account.email && !isValidEmail(account.email)) accountsIssues.invalid_email++;
        if (!account.email && !account.phone) accountsIssues.missing_contact_info++;
        if (hasInvalidNameChars(account.name)) accountsIssues.invalid_name_characters++;
      });

      const accountsTotal = accountsData.length || 1;
      const accountsIssuesCount = Object.values(accountsIssues).reduce((sum, count) => sum + count, 0);
      const accountsIssuesPercentage = (accountsIssuesCount / accountsTotal) * 100;

      // Analyze Leads
      const leadsData = leads;
      const leadsIssues = {
        missing_first_name: 0,
        missing_last_name: 0,
        invalid_email: 0,
        missing_contact_info: 0,
        invalid_name_characters: 0,
      };

      leadsData.forEach((lead) => {
        if (!lead.first_name) leadsIssues.missing_first_name++;
        if (!lead.last_name) leadsIssues.missing_last_name++;
        if (lead.email && !isValidEmail(lead.email)) leadsIssues.invalid_email++;
        if (!lead.email && !lead.phone) leadsIssues.missing_contact_info++;
        if (hasInvalidNameChars(lead.first_name) || hasInvalidNameChars(lead.last_name)) {
          leadsIssues.invalid_name_characters++;
        }
      });

      const leadsTotal = leadsData.length || 1;
      const leadsIssuesCount = Object.values(leadsIssues).reduce((sum, count) => sum + count, 0);
      const leadsIssuesPercentage = (leadsIssuesCount / leadsTotal) * 100;

      // Analyze Opportunities
      const opportunitiesData = opportunities;
      const opportunitiesIssues = {};

      const opportunitiesTotal = opportunitiesData.length || 1;
      const opportunitiesIssuesCount = 0;
      const opportunitiesIssuesPercentage = 0;

      const report = {
        contacts: {
          total: contactsTotal,
          issues: contactsIssues,
          issues_count: contactsIssuesCount,
          issues_percentage: contactsIssuesPercentage,
        },
        accounts: {
          total: accountsTotal,
          issues: accountsIssues,
          issues_count: accountsIssuesCount,
          issues_percentage: accountsIssuesPercentage,
        },
        leads: {
          total: leadsTotal,
          issues: leadsIssues,
          issues_count: leadsIssuesCount,
          issues_percentage: leadsIssuesPercentage,
        },
        opportunities: {
          total: opportunitiesTotal,
          issues: opportunitiesIssues,
          issues_count: opportunitiesIssuesCount,
          issues_percentage: opportunitiesIssuesPercentage,
        },
      };

      res.json({ status: 'success', data: { report }, tenant_id });
    } catch (error) {
      logger.error('analyze-data-quality error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/validate-record - Validate single record
  router.post('/validate-record', async (req, res) => {
    try {
      const { tenant_id, entity_type, record: _record } = req.body || {};

      const validation = {
        valid: true,
        errors: [],
        warnings: [],
      };

      res.json({ status: 'success', data: validation, tenant_id, entity_type });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/check-duplicate-before-create - Check for duplicates before creating record
  router.post('/check-duplicate-before-create', async (req, res) => {
    try {
      const { entity_type, data, tenant_id } = req.body;

      if (!entity_type || !['Contact', 'Lead', 'Account'].includes(entity_type)) {
        return res.status(400).json({ status: 'error', message: 'Invalid entity_type' });
      }

      if (!data) {
        return res.status(400).json({ status: 'error', message: 'Data required' });
      }

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const potentialDuplicates = [];
      const tableMap = {
        Contact: 'contacts',
        Lead: 'leads',
        Account: 'accounts',
      };
      const table = tableMap[entity_type];

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      if (entity_type === 'Contact' || entity_type === 'Lead') {
        // Check email
        if (data.email) {
          const { data: emailRows, error } = await supabase
            .from(table)
            .select('*')
            .eq('tenant_id', tenant_id)
            .eq('email', data.email);
          if (error) throw new Error(error.message);
          (emailRows || []).forEach((match) => {
            potentialDuplicates.push({
              ...match,
              reason: 'Same email address',
            });
          });
        }

        // Check phone
        if (data.phone) {
          const phoneNorm = normalizeString(data.phone);
          const { data: allRecords, error } = await supabase
            .from(table)
            .select('id, phone, mobile, first_name, last_name, email')
            .eq('tenant_id', tenant_id);
          if (error) throw new Error(error.message);
          (allRecords || []).forEach((record) => {
            const recordPhone = normalizeString(record.phone || record.mobile);
            if (recordPhone === phoneNorm && !potentialDuplicates.find((d) => d.id === record.id)) {
              potentialDuplicates.push({
                ...record,
                reason: 'Same phone number',
              });
            }
          });
        }
      } else if (entity_type === 'Account') {
        // Check website
        if (data.website) {
          const { data: websiteRows, error } = await supabase
            .from(table)
            .select('*')
            .eq('tenant_id', tenant_id)
            .eq('website', data.website);
          if (error) throw new Error(error.message);
          (websiteRows || []).forEach((match) => {
            potentialDuplicates.push({
              ...match,
              reason: 'Same website',
            });
          });
        }

        // Check similar company name
        if (data.name) {
          const { data: allAccounts, error } = await supabase
            .from(table)
            .select('id, name, website, email, phone')
            .eq('tenant_id', tenant_id);
          if (error) throw new Error(error.message);
          const nameNorm = normalizeString(data.name);

          (allAccounts || []).forEach((account) => {
            const accountNameNorm = normalizeString(account.name);
            if (accountNameNorm === nameNorm && !potentialDuplicates.find((d) => d.id === account.id)) {
              potentialDuplicates.push({
                ...account,
                reason: 'Same company name',
              });
            }
          });
        }
      }

      res.json({
        status: 'success',
        data: {
          has_duplicates: potentialDuplicates.length > 0,
          duplicates: potentialDuplicates,
        },
      });
    } catch (error) {
      logger.error('checkDuplicateBeforeCreate error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/validate-and-import - Validate and import records
  // OPTIMIZED: Uses bulk insert instead of row-by-row to minimize DB round-trips.
  router.post('/validate-and-import', async (req, res) => {
    try {
      const { records, entityType, mapping: _mapping, fileName, accountLinkColumn, tenant_id } = req.body;

      if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No records provided',
          successCount: 0,
          failCount: 0,
          errors: [],
        });
      }

      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id required',
          successCount: 0,
          failCount: 0,
          errors: [],
        });
      }

      logger.debug(`📥 Import request: ${records.length} ${entityType} records`);

      const results = {
        successCount: 0,
        failCount: 0,
        errors: [],
        accountsLinked: 0,
        accountsNotFound: 0,
        matchingDetails: [],
      };

      // Map entity type to table name
      const tableMap = {
        Contact: 'contacts',
        Account: 'accounts',
        Lead: 'leads',
        Opportunity: 'opportunities',
        Activity: 'activities',
        BizDevSource: 'bizdev_sources',
      };
      const table = tableMap[entityType];

      if (!table) {
        return res.status(400).json({
          status: 'error',
          message: `Unsupported entity type: ${entityType}`,
          successCount: 0,
          failCount: 0,
          errors: [],
        });
      }

      // Process account linking for Contacts if applicable
      let accountLookupMap = {};
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      if (entityType === 'Contact' && accountLinkColumn) {
        logger.debug(`🔗 Processing account links via column: ${accountLinkColumn}`);
        const { data: accountsData, error: accountsErr } = await supabase
          .from('accounts')
          .select('id, name, legacy_id')
          .eq('tenant_id', tenant_id);
        if (accountsErr) throw new Error(accountsErr.message);

        // Build lookup map: company name (lowercase) -> account
        (accountsData || []).forEach((account) => {
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

        logger.debug(`📚 Built account lookup with ${Object.keys(accountLookupMap).length} entries`);
      }

      // ── Phase 1: Validate all records and prepare for bulk insert ──
      const validRecords = [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const rowNumber = i + 2; // +2 for header row and 0-index

        try {
          // Validate required fields based on entity type
          if (entityType === 'Contact') {
            if (!record.first_name && !record.last_name) {
              results.errors.push({
                row_number: rowNumber,
                error: 'Missing required fields: at least first_name or last_name is required',
              });
              results.failCount++;
              continue;
            }
            if (!record.first_name) record.first_name = 'UNK';
            if (!record.last_name) record.last_name = 'UNK';
          } else if (entityType === 'BizDevSource') {
            if (!record.company_name) {
              results.errors.push({
                row_number: rowNumber,
                error: 'Missing required field: company_name is required',
              });
              results.failCount++;
              continue;
            }
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
                matchMethod,
              });
            } else {
              results.accountsNotFound++;
              results.matchingDetails.push({
                rowNumber,
                companyValue,
                matched: false,
              });
            }

            delete record._company_name;
          }

          // Add tenant_id and track original row number
          record.tenant_id = tenant_id;
          validRecords.push({ record, rowNumber });
        } catch (error) {
          results.errors.push({
            row_number: rowNumber,
            error: error.message || 'Validation error',
          });
          results.failCount++;
        }
      }

      // ── Phase 2: Bulk insert validated records ──
      if (validRecords.length > 0) {
        // Discover actual column names for the target table so we can strip
        // any mapped keys that don't exist (prevents schema cache errors).
        let tableColumns = null;
        try {
          // Probe table: even on an empty table, Supabase returns column keys
          // when at least one row exists. For empty tables, we query
          // information_schema via PostgREST's built-in RPC.
          const { data: probeRows } = await supabase.from(table).select('*').limit(1);
          if (probeRows && probeRows.length > 0) {
            tableColumns = new Set(Object.keys(probeRows[0]));
          }
        } catch { /* ignore */ }

        // Fallback for empty tables: query column names via Supabase RPC
        if (!tableColumns) {
          try {
            const { data: colRows } = await supabase.rpc('get_columns_for_table', { t_name: table });
            if (Array.isArray(colRows) && colRows.length > 0) {
              tableColumns = new Set(colRows.map(r => r.column_name));
            }
          } catch { /* RPC may not exist — will attempt insert without filtering */ }
        }

        // Strip unknown columns from every record
        const strippedKeys = new Set();
        const payload = validRecords.map((v) => {
          if (!tableColumns) return v.record;
          const cleaned = {};
          for (const [key, val] of Object.entries(v.record)) {
            if (tableColumns.has(key)) {
              cleaned[key] = val;
            } else {
              strippedKeys.add(key);
            }
          }
          return cleaned;
        });
        if (strippedKeys.size > 0) {
          logger.warn(`⏭️ Stripped unknown columns from ${table} import: ${[...strippedKeys].join(', ')}`);
        }

        const { error: bulkErr, count: insertedCount } = await supabase
          .from(table)
          .insert(payload, { count: 'exact' });

        if (bulkErr) {
          // If the bulk insert fails entirely (e.g. constraint violation on one
          // row causes Postgres to reject the whole batch), fall back to
          // row-by-row so we can identify the problematic rows.
          logger.warn(`⚠️ Bulk insert failed (${bulkErr.message}), falling back to row-by-row`);

          for (const { record, rowNumber } of validRecords) {
            try {
              const { error: rowErr } = await supabase
                .from(table)
                .insert([record]);
              if (rowErr) throw new Error(rowErr.message);
              results.successCount++;
            } catch (rowError) {
              results.errors.push({
                row_number: rowNumber,
                error: rowError.message || 'Insert failed',
              });
              results.failCount++;
            }
          }
        } else {
          // Bulk insert succeeded — all valid records inserted
          results.successCount = insertedCount ?? validRecords.length;
        }
      }

      logger.debug(`✅ Import complete: ${results.successCount} success, ${results.failCount} failed`);

      // Invalidate cache so the UI shows new data immediately
      if (results.successCount > 0 && tenant_id && table) {
        // Map DB table name back to cache module name
        const cacheModuleMap = {
          contacts: 'contacts',
          accounts: 'accounts',
          leads: 'leads',
          opportunities: 'opportunities',
          activities: 'activities',
          bizdev_sources: 'bizdevsources',
        };
        const cacheModule = cacheModuleMap[table];
        if (cacheModule) {
          await invalidateTenantCache(tenant_id, cacheModule);
          logger.debug(`🗑️ Cache invalidated: ${cacheModule} for tenant ${tenant_id}`);
        }
      }

      res.json({
        status: 'success',
        data: results,
      });
    } catch (error) {
      logger.error('❌ validateAndImport error:', error);
      res.status(500).json({
        status: 'error',
        message: `An unexpected server error occurred: ${error.message}`,
        successCount: 0,
        failCount: 0,
        errors: [],
      });
    }
  });

  return router;
}
