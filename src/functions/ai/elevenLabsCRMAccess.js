/**
 * elevenLabsCRMAccess
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Webhook endpoint for ElevenLabs ConvAI agent to access CRM data
 * This allows the ElevenLabs widget to query contacts, leads, opportunities, etc.
 * 
 * Configure this URL in your ElevenLabs agent as a custom tool/webhook:
 * https://app.base44.com/api/apps/68ad592dcffacef630b477d2/functions/elevenLabsCRMAccess
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get request body
    const body = await req.json();
    console.log('[ElevenLabs CRM Access] Request:', body);
    
    const { 
      action, 
      tenant_id, 
      entity_type, 
      query, 
      filters = {},
      limit = 10 
    } = body;
    
    // Validate tenant_id
    if (!tenant_id) {
      return Response.json({ 
        error: 'Missing tenant_id',
        message: 'Please provide tenant_id in the request'
      }, { status: 400 });
    }
    
    // Add tenant filter to all queries
    const tenantFilter = { ...filters, tenant_id };
    
    let result;
    
    switch (action) {
      case 'search_contacts': {
        const contacts = await base44.asServiceRole.entities.Contact.filter(
          { 
            ...tenantFilter,
            ...(query ? { 
              $or: [
                { first_name: { $regex: query, $options: 'i' } },
                { last_name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } },
                { company: { $regex: query, $options: 'i' } }
              ]
            } : {})
          },
          '-created_date',
          limit
        );
        result = {
          success: true,
          count: contacts.length,
          contacts: contacts.map(c => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
            email: c.email,
            phone: c.phone,
            company: c.account_name,
            status: c.status
          }))
        };
        break;
      }
        
      case 'search_leads': {
        const leads = await base44.asServiceRole.entities.Lead.filter(
          {
            ...tenantFilter,
            ...(query ? {
              $or: [
                { first_name: { $regex: query, $options: 'i' } },
                { last_name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } },
                { company: { $regex: query, $options: 'i' } }
              ]
            } : {})
          },
          '-created_date',
          limit
        );
        result = {
          success: true,
          count: leads.length,
          leads: leads.map(l => ({
            id: l.id,
            name: `${l.first_name} ${l.last_name}`,
            email: l.email,
            phone: l.phone,
            company: l.company,
            status: l.status,
            source: l.source,
            score: l.score
          }))
        };
        break;
      }
        
      case 'search_opportunities': {
        const opportunities = await base44.asServiceRole.entities.Opportunity.filter(
          {
            ...tenantFilter,
            ...(query ? {
              $or: [
                { name: { $regex: query, $options: 'i' } },
                { account_name: { $regex: query, $options: 'i' } }
              ]
            } : {})
          },
          '-created_date',
          limit
        );
        result = {
          success: true,
          count: opportunities.length,
          opportunities: opportunities.map(o => ({
            id: o.id,
            name: o.name,
            account: o.account_name,
            amount: o.amount,
            stage: o.stage,
            close_date: o.close_date,
            probability: o.probability
          }))
        };
        break;
      }
        
      case 'search_accounts': {
        const accounts = await base44.asServiceRole.entities.Account.filter(
          {
            ...tenantFilter,
            ...(query ? {
              $or: [
                { name: { $regex: query, $options: 'i' } },
                { industry: { $regex: query, $options: 'i' } }
              ]
            } : {})
          },
          '-created_date',
          limit
        );
        result = {
          success: true,
          count: accounts.length,
          accounts: accounts.map(a => ({
            id: a.id,
            name: a.name,
            industry: a.industry,
            website: a.website,
            phone: a.phone,
            type: a.type
          }))
        };
        break;
      }
        
      case 'get_contact_details': {
        if (!body.contact_id) {
          return Response.json({ error: 'Missing contact_id' }, { status: 400 });
        }
        const contact = await base44.asServiceRole.entities.Contact.get(body.contact_id);
        if (!contact || contact.tenant_id !== tenant_id) {
          return Response.json({ error: 'Contact not found or access denied' }, { status: 404 });
        }
        result = {
          success: true,
          contact: {
            id: contact.id,
            name: `${contact.first_name} ${contact.last_name}`,
            email: contact.email,
            phone: contact.phone,
            mobile: contact.mobile,
            company: contact.account_name,
            job_title: contact.job_title,
            status: contact.status,
            address: {
              city: contact.city,
              state: contact.state,
              country: contact.country
            }
          }
        };
        break;
      }
        
      case 'get_lead_details': {
        if (!body.lead_id) {
          return Response.json({ error: 'Missing lead_id' }, { status: 400 });
        }
        const lead = await base44.asServiceRole.entities.Lead.get(body.lead_id);
        if (!lead || lead.tenant_id !== tenant_id) {
          return Response.json({ error: 'Lead not found or access denied' }, { status: 404 });
        }
        result = {
          success: true,
          lead: {
            id: lead.id,
            name: `${lead.first_name} ${lead.last_name}`,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            job_title: lead.job_title,
            status: lead.status,
            source: lead.source,
            score: lead.score,
            score_reason: lead.score_reason
          }
        };
        break;
      }
        
      case 'get_dashboard_summary': {
        const [
          totalContacts,
          totalLeads,
          totalOpps,
          activeOpps
        ] = await Promise.all([
          base44.asServiceRole.entities.Contact.filter(tenantFilter),
          base44.asServiceRole.entities.Lead.filter(tenantFilter),
          base44.asServiceRole.entities.Opportunity.filter(tenantFilter),
          base44.asServiceRole.entities.Opportunity.filter({
            ...tenantFilter,
            stage: { $nin: ['closed_won', 'closed_lost'] }
          })
        ]);
        
        const pipelineValue = activeOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);
        
        result = {
          success: true,
          summary: {
            total_contacts: totalContacts.length,
            total_leads: totalLeads.length,
            total_opportunities: totalOpps.length,
            active_opportunities: activeOpps.length,
            pipeline_value: pipelineValue,
            pipeline_value_formatted: `$${(pipelineValue / 1000).toFixed(1)}K`
          }
        };
        break;
      }
        
      default:
        return Response.json({ 
          error: 'Invalid action',
          available_actions: [
            'search_contacts',
            'search_leads',
            'search_opportunities',
            'search_accounts',
            'get_contact_details',
            'get_lead_details',
            'get_dashboard_summary'
          ]
        }, { status: 400 });
    }
    
    console.log('[ElevenLabs CRM Access] Success:', { action, result });
    return Response.json(result);
    
  } catch (error) {
    console.error('[ElevenLabs CRM Access] Error:', error);
    return Response.json({ 
      error: 'Internal server error',
      message: error.message,
      details: error.stack
    }, { status: 500 });
  }
});

----------------------------

export default elevenLabsCRMAccess;
