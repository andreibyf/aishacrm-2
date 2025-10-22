/**
 * promoteBizDevSourceToAccount
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

    const { bizdev_source_id, create_opportunity } = await req.json();

    if (!bizdev_source_id) {
      return Response.json({ error: 'bizdev_source_id is required' }, { status: 400 });
    }

    // Get the BizDev Source
    const bizDevSources = await base44.asServiceRole.entities.BizDevSource.filter({ id: bizdev_source_id });
    const bizDevSource = bizDevSources?.[0];

    if (!bizDevSource) {
      return Response.json({ error: 'BizDev Source not found' }, { status: 404 });
    }

    // Check if already promoted
    if (bizDevSource.account_id) {
      return Response.json({ 
        error: 'This BizDev Source has already been promoted to an Account',
        account_id: bizDevSource.account_id 
      }, { status: 400 });
    }

    // Create Account
    const accountPayload = {
      tenant_id: bizDevSource.tenant_id,
      name: bizDevSource.company_name,
      industry: bizDevSource.industry || 'other',
      website: bizDevSource.website || undefined,
      email: bizDevSource.email || undefined,
      phone: bizDevSource.phone_number || undefined,
      address_1: bizDevSource.address_line_1 || undefined,
      address_2: bizDevSource.address_line_2 || undefined,
      city: bizDevSource.city || undefined,
      state: bizDevSource.state_province || undefined,
      zip: bizDevSource.postal_code || undefined,
      country: bizDevSource.country || undefined,
      type: 'prospect',
      tags: ['from_bizdev', ...(bizDevSource.source ? [bizDevSource.source] : [])],
      description: `Account created from BizDev Source: ${bizDevSource.source || 'N/A'}${bizDevSource.batch_id ? `\nBatch: ${bizDevSource.batch_id}` : ''}${bizDevSource.notes ? `\nNotes: ${bizDevSource.notes}` : ''}`,
      assigned_to: user.email,
      is_test_data: false
    };

    const newAccount = await base44.asServiceRole.entities.Account.create(accountPayload);

    // Update BizDev Source with link to Account
    await base44.asServiceRole.entities.BizDevSource.update(bizDevSource.id, {
      status: 'Promoted',
      account_id: newAccount.id,
      account_name: newAccount.name
    });

    let newOpportunity = null;

    // Optionally create Opportunity
    if (create_opportunity) {
      const opportunityPayload = {
        tenant_id: bizDevSource.tenant_id,
        name: `${bizDevSource.company_name} - New Business Opportunity`,
        account_id: newAccount.id,
        account_name: newAccount.name,
        stage: 'qualification',
        amount: 0,
        close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        type: 'new_business',
        lead_source: 'other',
        // FIXED: Removed [BizDevSource:${bizDevSource.id}] from description
        description: `Opportunity created from BizDev Source: ${bizDevSource.source || 'N/A'}${bizDevSource.batch_id ? `\nBatch: ${bizDevSource.batch_id}` : ''}\nCompany: ${bizDevSource.company_name}\nContact: ${bizDevSource.phone_number || 'N/A'}`,
        assigned_to: user.email,
        is_test_data: false
      };

      newOpportunity = await base44.asServiceRole.entities.Opportunity.create(opportunityPayload);
    }

    return Response.json({
      success: true,
      account: newAccount,
      opportunity: newOpportunity,
      message: `Successfully promoted to Account${create_opportunity ? ' with Opportunity' : ''}`
    });

  } catch (error) {
    console.error('Error promoting BizDev Source:', error);
    return Response.json({ 
      error: error.message || 'Failed to promote BizDev Source',
      details: error.toString()
    }, { status: 500 });
  }
});

----------------------------

export default promoteBizDevSourceToAccount;
