/**
 * Validation Routes
 * Data quality, duplicates, validation
 * MIGRATED: Added checkDuplicateBeforeCreate and validateAndImport from functions
 */

import express from 'express';

// Helper to normalize strings for duplicate detection
function normalizeString(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

// Helper: dynamic duplicate finder for a given entity and fields (Postgres only)
async function findDuplicatesInDb(pgPool, entityTable, tenantId, fields = []) {
  if (!pgPool || !entityTable || !tenantId || fields.length === 0) {
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
  const keyExpr = safeFields
    .map((f) => `COALESCE(${f}::text, '')`)
    .join(` || '|' || `);

  const sql = `
    SELECT ${keyExpr} AS dup_key, COUNT(*) AS cnt
    FROM ${entityTable}
    WHERE tenant_id = $1
    GROUP BY ${keyExpr}
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 200
  `;

  try {
    const result = await pgPool.query(sql, [tenantId]);
    const groups = (result.rows || []).map((r) => ({ key: r.dup_key, count: Number(r.cnt) }));
    return { total: groups.length, groups };
  } catch {
    // Table might not exist yet — return empty result
    return { total: 0, groups: [] };
  }
}

export default function createValidationRoutes(pgPool) {
  const router = express.Router();

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

      const result = await findDuplicatesInDb(pgPool, table, tenant_id, fields);
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
      const { tenant_id, entity_type } = req.body || {};

      const analysis = {
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        issues: [],
        recommendations: [],
      };

      res.json({ status: 'success', data: analysis, tenant_id, entity_type });
    } catch (error) {
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

      if (entity_type === 'Contact' || entity_type === 'Lead') {
        // Check email
        if (data.email) {
          const emailMatches = await pgPool.query(
            `SELECT * FROM ${table} WHERE tenant_id = $1 AND email = $2`,
            [tenant_id, data.email]
          );

          emailMatches.rows.forEach((match) => {
            potentialDuplicates.push({
              ...match,
              reason: 'Same email address',
            });
          });
        }

        // Check phone
        if (data.phone) {
          const phoneNorm = normalizeString(data.phone);
          const allRecords = await pgPool.query(
            `SELECT * FROM ${table} WHERE tenant_id = $1`,
            [tenant_id]
          );

          allRecords.rows.forEach((record) => {
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
          const websiteMatches = await pgPool.query(
            `SELECT * FROM ${table} WHERE tenant_id = $1 AND website = $2`,
            [tenant_id, data.website]
          );

          websiteMatches.rows.forEach((match) => {
            potentialDuplicates.push({
              ...match,
              reason: 'Same website',
            });
          });
        }

        // Check similar company name
        if (data.name) {
          const allAccounts = await pgPool.query(
            `SELECT * FROM ${table} WHERE tenant_id = $1`,
            [tenant_id]
          );
          const nameNorm = normalizeString(data.name);

          allAccounts.rows.forEach((account) => {
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
      console.error('checkDuplicateBeforeCreate error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/validation/validate-and-import - Validate and import records
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

      console.log(`📥 Import request: ${records.length} ${entityType} records`);

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
      if (entityType === 'Contact' && accountLinkColumn) {
        console.log(`🔗 Processing account links via column: ${accountLinkColumn}`);

        const accountsResult = await pgPool.query('SELECT * FROM accounts WHERE tenant_id = $1', [tenant_id]);

        // Build lookup map: company name (lowercase) -> account
        accountsResult.rows.forEach((account) => {
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
                error: 'Missing required fields: at least first_name or last_name is required',
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
                error: 'Missing required field: company_name is required',
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

          // Add tenant_id
          record.tenant_id = tenant_id;

          // Build INSERT query dynamically
          const fields = Object.keys(record);
          const values = Object.values(record);
          const placeholders = fields.map((_, idx) => `$${idx + 1}`).join(', ');

          const insertSql = `
            INSERT INTO ${table} (${fields.join(', ')})
            VALUES (${placeholders})
            RETURNING *
          `;

          await pgPool.query(insertSql, values);
          results.successCount++;
        } catch (error) {
          console.error(`Row ${rowNumber} failed:`, error);
          results.errors.push({
            row_number: rowNumber,
            error: error.message || 'Unknown error',
          });
          results.failCount++;
        }
      }

      console.log(`✅ Import complete: ${results.successCount} success, ${results.failCount} failed`);

      res.json({
        status: 'success',
        data: results,
      });
    } catch (error) {
      console.error('❌ validateAndImport error:', error);
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
