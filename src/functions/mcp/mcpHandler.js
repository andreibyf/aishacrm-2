/**
 * mcpHandler
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { method, params } = body;

    // Helper to get tenant filter
    const getTenantFilter = () => {
      let filter = {};
      
      if (user.role === 'superadmin' || user.role === 'admin') {
        if (user.tenant_id) {
          filter.tenant_id = user.tenant_id;
        } else {
          console.warn('[MCP Handler] Admin has no tenant selected.');
        }
      } else if (user.tenant_id) {
        filter.tenant_id = user.tenant_id;
      }
      return filter;
    };

    const tenantFilter = getTenantFilter();

    console.log('[MCP Handler] ==================== REQUEST ====================');
    console.log('[MCP Handler] User:', user.email);
    console.log('[MCP Handler] Role:', user.role);
    console.log('[MCP Handler] User Tenant ID:', user.tenant_id);
    console.log('[MCP Handler] Tenant Filter:', JSON.stringify(tenantFilter));
    console.log('[MCP Handler] Method:', method);
    console.log('[MCP Handler] Tool:', params?.name);
    console.log('[MCP Handler] ================================================');

    // Handle different MCP methods
    switch (method) {
      case 'tools/list':
        return Response.json({
          tools: [
            {
              name: 'list_contacts',
              description: 'List all contacts in the CRM for the current tenant only',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: { type: 'number', description: 'Maximum number of contacts to return' }
                }
              }
            },
            {
              name: 'list_leads',
              description: 'List all leads in the CRM for the current tenant only',
              inputSchema: {
                type: 'object',
                properties: {
                  status: { type: 'string', description: 'Filter by lead status' },
                  limit: { type: 'number', description: 'Maximum number of leads to return' }
                }
              }
            },
            {
              name: 'list_opportunities',
              description: 'List all opportunities in the CRM for the current tenant only',
              inputSchema: {
                type: 'object',
                properties: {
                  stage: { type: 'string', description: 'Filter by opportunity stage' },
                  limit: { type: 'number', description: 'Maximum number of opportunities to return' }
                }
              }
            },
            {
              name: 'list_activities',
              description: 'List activities in the CRM for the current tenant only',
              inputSchema: {
                type: 'object',
                properties: {
                  status: { type: 'string', description: 'Filter by activity status' },
                  limit: { type: 'number', description: 'Maximum number of activities to return' }
                }
              }
            },
            {
              name: 'list_accounts',
              description: 'List all accounts in the CRM for the current tenant. Can filter by a fuzzy account name.',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Partial or full name to fuzzy match accounts.' }
                }
              }
            },
            {
              name: 'get_account_contacts',
              description: 'Retrieve contacts associated with a specific account by account ID or fuzzy account name. Only returns contacts for the current tenant.',
              inputSchema: {
                type: 'object',
                properties: {
                  account_id: { type: 'string', description: 'The ID of the account to retrieve contacts for.' },
                  account_name: { type: 'string', description: 'Partial or full name of the account to fuzzy match and retrieve contacts for. Used if account_id is not provided.' }
                },
                anyOf: [
                  { required: ['account_id'] },
                  { required: ['account_name'] }
                ]
              }
            },
            {
              name: 'create_contact',
              description: 'Create a new contact',
              inputSchema: {
                type: 'object',
                properties: {
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  company: { type: 'string' }
                },
                required: ['first_name', 'last_name']
              }
            },
            {
              name: 'create_lead',
              description: 'Create a new lead',
              inputSchema: {
                type: 'object',
                properties: {
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  company: { type: 'string' },
                  source: { type: 'string' }
                },
                required: ['first_name', 'last_name']
              }
            },
            {
              name: 'create_opportunity',
              description: 'Create a new opportunity',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  amount: { type: 'number' },
                  close_date: { type: 'string' },
                  stage: { type: 'string' }
                },
                required: ['name', 'amount', 'close_date']
              }
            },
            {
              name: 'create_activity',
              description: 'Create a new activity',
              inputSchema: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  subject: { type: 'string' },
                  due_date: { type: 'string' },
                  description: { type: 'string' }
                },
                required: ['type', 'subject']
              }
            }
          ]
        }, {
          status: 200
        });

      case 'tools/call': {
        const toolName = params.name;
        const args = params.arguments || {};

        if (!tenantFilter.tenant_id) {
          console.error('[MCP] No tenant filter available for tool call:', toolName);
          return Response.json({
            content: [{
              type: 'text',
              text: 'Error: No client context available. Please ensure a client is selected for this operation.'
            }],
            isError: true
          }, {
            status: 200
          });
        }

        console.log('[MCP Tool Call] ==================== TOOL CALL ====================');
        console.log('[MCP Tool Call] Tool:', toolName);
        console.log('[MCP Tool Call] Args:', JSON.stringify(args));
        console.log('[MCP Tool Call] Tenant Filter:', JSON.stringify(tenantFilter));
        console.log('[MCP Tool Call] =========================================================');

        switch (toolName) {
          case 'list_contacts': {
            const limit = args.limit || 50;
            const contacts = await base44.entities.Contact.filter(tenantFilter);
            
            console.log('[MCP] Contacts Result:', {
              total: contacts.length,
              tenant_filter: tenantFilter.tenant_id,
              sample_tenant_ids: contacts.slice(0, 3).map(c => c.tenant_id)
            });
            
            const wrongTenant = contacts.filter(c => c.tenant_id !== tenantFilter.tenant_id);
            if (wrongTenant.length > 0) {
              console.error('[MCP] TENANT LEAK DETECTED IN CONTACTS!', {
                expected: tenantFilter.tenant_id,
                wrong_count: wrongTenant.length,
                wrong_tenants: [...new Set(wrongTenant.map(c => c.tenant_id))]
              });
            }
            
            const filtered = contacts.filter(c => c.tenant_id === tenantFilter.tenant_id).slice(0, limit);
            
            return Response.json({
              content: [{
                type: 'text',
                text: JSON.stringify(filtered, null, 2)
              }]
            }, {
              status: 200
            });
          }

          case 'list_leads': {
            const limit = args.limit || 50;
            let filter = { ...tenantFilter };
            if (args.status) {
              filter.status = args.status;
            }
            
            const leads = await base44.entities.Lead.filter(filter);
            
            console.log('[MCP] Leads Result:', {
              total: leads.length,
              tenant_filter: tenantFilter.tenant_id,
              sample_tenant_ids: leads.slice(0, 3).map(l => l.tenant_id)
            });
            
            const wrongTenant = leads.filter(l => l.tenant_id !== tenantFilter.tenant_id);
            if (wrongTenant.length > 0) {
              console.error('[MCP] TENANT LEAK DETECTED IN LEADS!', {
                expected: tenantFilter.tenant_id,
                wrong_count: wrongTenant.length,
                wrong_tenants: [...new Set(wrongTenant.map(l => l.tenant_id))]
              });
            }
            
            const filtered = leads.filter(l => l.tenant_id === tenantFilter.tenant_id).slice(0, limit);
            
            return Response.json({
              content: [{
                type: 'text',
                text: JSON.stringify(filtered, null, 2)
              }]
            }, {
              status: 200
            });
          }

          case 'list_opportunities': {
            const limit = args.limit || 50;
            let filter = { ...tenantFilter };
            if (args.stage) {
              filter.stage = args.stage;
            }
            
            const opportunities = await base44.entities.Opportunity.filter(filter);
            
            console.log('[MCP] Opportunities Result:', {
              total: opportunities.length,
              tenant_filter: tenantFilter.tenant_id
            });
            
            const wrongTenant = opportunities.filter(o => o.tenant_id !== tenantFilter.tenant_id);
            if (wrongTenant.length > 0) {
              console.error('[MCP] TENANT LEAK DETECTED IN OPPORTUNITIES!', {
                expected: tenantFilter.tenant_id,
                wrong_count: wrongTenant.length
              });
            }
            
            const filtered = opportunities.filter(o => o.tenant_id === tenantFilter.tenant_id).slice(0, limit);
            
            return Response.json({
              content: [{
                type: 'text',
                text: filtered.length > 0 ? 
                  JSON.stringify(filtered, null, 2) : 
                  'No opportunities found for your client.'
              }]
            }, {
              status: 200
            });
          }

          case 'list_activities': {
            const limit = args.limit || 50;
            let filter = { ...tenantFilter };
            if (args.status) {
              filter.status = args.status;
            }
            
            const activities = await base44.entities.Activity.filter(filter);
            
            const wrongTenant = activities.filter(a => a.tenant_id !== tenantFilter.tenant_id);
            if (wrongTenant.length > 0) {
              console.error('[MCP] TENANT LEAK DETECTED IN ACTIVITIES!');
            }
            
            const filtered = activities.filter(a => a.tenant_id === tenantFilter.tenant_id).slice(0, limit);
            
            return Response.json({
              content: [{
                type: 'text',
                text: JSON.stringify(filtered, null, 2)
              }]
            }, {
              status: 200
            });
          }

          case 'list_accounts': {
            const searchName = args.name ? args.name.toLowerCase().trim() : null;
            
            const allAccounts = await base44.entities.Account.filter(tenantFilter);
            
            let matchedAccounts = allAccounts;

            if (searchName) {
              matchedAccounts = allAccounts.filter(account => {
                const accountName = (account.name || '').toLowerCase();
                return accountName.includes(searchName) || searchName.includes(accountName);
              });
            }
            
            const wrongTenant = matchedAccounts.filter(a => a.tenant_id !== tenantFilter.tenant_id);
            if (wrongTenant.length > 0) {
              console.error('[MCP] TENANT LEAK DETECTED IN ACCOUNTS!');
              matchedAccounts = matchedAccounts.filter(a => a.tenant_id === tenantFilter.tenant_id);
            }

            return Response.json({
              content: [{
                type: 'text',
                text: JSON.stringify({
                  accounts: matchedAccounts.map(a => ({
                    id: a.id,
                    name: a.name,
                    industry: a.industry,
                    phone: a.phone,
                    email: a.email,
                    website: a.website,
                    annual_revenue: a.annual_revenue,
                    employee_count: a.employee_count,
                    city: a.city,
                    state: a.state,
                    type: a.type
                  })),
                  count: matchedAccounts.length,
                  search_term: searchName || undefined
                }, null, 2)
              }]
            });
          }

          case 'get_account_contacts': {
            const accountId = args.account_id;
            const accountName = args.account_name;
            
            let targetAccountId = accountId;
            let matchedAccountInfo = [];
            
            if (accountName && !targetAccountId) {
              const allAccounts = await base44.entities.Account.filter(tenantFilter);
              
              const searchName = accountName.toLowerCase().trim();
              matchedAccountInfo = allAccounts.filter(account => {
                const name = (account.name || '').toLowerCase();
                return name.includes(searchName) || searchName.includes(name);
              }).map(a => ({ id: a.id, name: a.name }));
              
              if (matchedAccountInfo.length === 0) {
                return Response.json({
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: `No accounts found matching "${accountName}" for client ${tenantFilter.tenant_id}.`,
                      contacts: []
                    }, null, 2)
                  }]
                });
              }
              
              if (matchedAccountInfo.length > 1) {
                const allContacts = [];
                for (const account of matchedAccountInfo) {
                  const contacts = await base44.entities.Contact.filter({ 
                    ...tenantFilter,
                    account_id: account.id 
                  });

                  const wrongTenant = contacts.filter(c => c.tenant_id !== tenantFilter.tenant_id);
                  if (wrongTenant.length > 0) {
                    console.error('[MCP] TENANT LEAK DETECTED IN GET_ACCOUNT_CONTACTS!');
                  }
                  
                  const filteredContacts = contacts.filter(c => c.tenant_id === tenantFilter.tenant_id);

                  allContacts.push(...filteredContacts.map(c => ({
                    ...c,
                    _account_name: account.name
                  })));
                }
                
                return Response.json({
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      message: `Found ${matchedAccountInfo.length} accounts matching "${accountName}". Returning contacts from all.`,
                      matched_accounts: matchedAccountInfo,
                      contacts: allContacts.map(c => ({
                        id: c.id,
                        first_name: c.first_name,
                        last_name: c.last_name,
                        email: c.email,
                        phone: c.phone,
                        mobile: c.mobile,
                        job_title: c.job_title,
                        account_name: c._account_name || c.account_name,
                        status: c.status
                      })),
                      count: allContacts.length
                    }, null, 2)
                  }]
                });
              }
              
              targetAccountId = matchedAccountInfo[0].id;
            }
            
            if (!targetAccountId) {
              return Response.json({
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'account_id or account_name is required',
                    contacts: []
                  }, null, 2)
                }]
              }, { status: 400 });
            }
            
            const contacts = await base44.entities.Contact.filter({ 
              ...tenantFilter,
              account_id: targetAccountId 
            });

            const wrongTenant = contacts.filter(c => c.tenant_id !== tenantFilter.tenant_id);
            if (wrongTenant.length > 0) {
              console.error('[MCP] TENANT LEAK DETECTED IN GET_ACCOUNT_CONTACTS!');
            }
            const filteredContacts = contacts.filter(c => c.tenant_id === tenantFilter.tenant_id);
            
            return Response.json({
              content: [{
                type: 'text',
                text: JSON.stringify({
                  contacts: filteredContacts.map(c => ({
                    id: c.id,
                    first_name: c.first_name,
                    last_name: c.last_name,
                    email: c.email,
                    phone: c.phone,
                    mobile: c.mobile,
                    job_title: c.job_title,
                    account_name: c.account_name,
                    status: c.status
                  })),
                  count: filteredContacts.length
                }, null, 2)
              }]
            });
          }

          case 'create_contact': {
            const contactData = {
              ...args,
              tenant_id: tenantFilter.tenant_id,
              assigned_to: user.email
            };
            
            const newContact = await base44.entities.Contact.create(contactData);
            
            return Response.json({
              content: [{
                type: 'text',
                text: `Contact created successfully: ${newContact.first_name} ${newContact.last_name}`
              }]
            }, {
              status: 200
            });
          }

          case 'create_lead': {
            const leadData = {
              ...args,
              tenant_id: tenantFilter.tenant_id,
              assigned_to: user.email
            };
            
            const newLead = await base44.entities.Lead.create(leadData);
            
            return Response.json({
              content: [{
                type: 'text',
                text: `Lead created successfully: ${newLead.first_name} ${newLead.last_name}`
              }]
            }, {
              status: 200
            });
          }

          case 'create_opportunity': {
            const oppData = {
              ...args,
              tenant_id: tenantFilter.tenant_id,
              assigned_to: user.email
            };
            
            const newOpp = await base44.entities.Opportunity.create(oppData);
            
            return Response.json({
              content: [{
                type: 'text',
                text: `Opportunity created successfully: ${newOpp.name}`
              }]
            }, {
              status: 200
            });
          }

          case 'create_activity': {
            const activityData = {
              ...args,
              tenant_id: tenantFilter.tenant_id,
              assigned_to: user.email
            };
            
            const newActivity = await base44.entities.Activity.create(activityData);
            
            return Response.json({
              content: [{
                type: 'text',
                text: `Activity created successfully: ${newActivity.subject}`
              }]
            }, {
              status: 200
            });
          }

          default:
            return Response.json({
              content: [{
                type: 'text',
                text: `Unknown tool: ${toolName}`
              }],
              isError: true
            }, {
              status: 200
            });
        }
      }

      default:
        return Response.json({
          error: `Unknown method: ${method}`
        }, {
          status: 400
        });
    }

  } catch (error) {
    console.error('[MCP Handler] ERROR:', error);
    console.error('[MCP Handler] Stack:', error.stack);
    
    return Response.json({
      error: error.message || 'Internal server error',
      details: error.stack
    }, {
      status: 500
    });
  }
});

----------------------------

export default mcpHandler;
