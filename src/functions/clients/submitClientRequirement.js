/**
 * submitClientRequirement
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    // Initialize SDK from request
    const base44 = createClientFromRequest(req);
    
    // Parse request body
    const payload = await req.json();
    console.log('[submitClientRequirement] Received payload:', JSON.stringify(payload, null, 2));

    // Validate required fields
    if (!payload.company_name) {
      return Response.json({
        status: 'error',
        message: 'Company name is required'
      }, { status: 400 });
    }

    if (!payload.industry) {
      return Response.json({
        status: 'error',
        message: 'Industry is required'
      }, { status: 400 });
    }

    // Prepare the ClientRequirement record
    const requirementData = {
      status: 'pending',
      company_name: payload.company_name,
      industry: payload.industry,
      business_model: payload.business_model || 'b2b',
      geographic_focus: payload.geographic_focus || 'north_america',
      project_title: payload.project_title || '',
      project_description: payload.project_description || '',
      target_test_date: payload.target_test_date || null,
      target_implementation_date: payload.target_implementation_date || null,
      selected_modules: payload.selected_modules || {},
      navigation_permissions: payload.navigation_permissions || {},
      initial_employee: payload.initial_employee || null,
      admin_notes: '',
    };

    console.log('[submitClientRequirement] Creating ClientRequirement with data:', JSON.stringify(requirementData, null, 2));

    // Create the ClientRequirement record using service role (no auth needed for public form)
    const created = await base44.asServiceRole.entities.ClientRequirement.create(requirementData);

    console.log('[submitClientRequirement] Successfully created ClientRequirement:', created.id);

    // TODO: Send notification email to admins
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'admin@aishacrm.app', // Change to your admin email
        subject: `New Client Onboarding Request: ${payload.company_name}`,
        body: `
          <h2>New Client Onboarding Request</h2>
          <p><strong>Company:</strong> ${payload.company_name}</p>
          <p><strong>Industry:</strong> ${payload.industry}</p>
          <p><strong>Business Model:</strong> ${payload.business_model || 'b2b'}</p>
          <p><strong>Project:</strong> ${payload.project_title || 'Not provided'}</p>
          <p><strong>Description:</strong> ${payload.project_description || 'Not provided'}</p>
          <hr>
          <p>View full details in the CRM Dashboard → Client Requirements</p>
        `
      });
      console.log('[submitClientRequirement] Notification email sent');
    } catch (emailError) {
      console.error('[submitClientRequirement] Failed to send notification email:', emailError);
      // Don't fail the entire request if email fails
    }

    return Response.json({
      status: 'success',
      message: 'Your request has been submitted successfully! Our team will review it and contact you soon.',
      requirement_id: created.id
    }, { status: 200 });

  } catch (error) {
    console.error('[submitClientRequirement] Error:', error);
    console.error('[submitClientRequirement] Error stack:', error.stack);
    
    return Response.json({
      status: 'error',
      message: error.message || 'Failed to submit client requirement',
      details: error.toString()
    }, { status: 500 });
  }
});

----------------------------

export default submitClientRequirement;
