/**
 * Hook for integrating profile data into forms
 * Prepopulates form fields with relevant data from lead/contact profile
 */

export function useProfileFormIntegration(profile, entityType = 'lead') {
  if (!profile) return {};

  /**
   * Get prepopulated data for ActivityForm
   */
  const getActivityFormData = () => {
    return {
      // Pre-set the related entity
      relatedTo: entityType, // 'lead' or 'contact'
      relatedId: profile.person_id || profile.id,
      // Pre-populate with contact info in description if available
      description: profile.ai_summary ? `From profile: ${profile.ai_summary.substring(0, 100)}...` : '',
      // If there's a high-priority overdue task, suggest scheduling a follow-up
      type: profile.open_opportunity_count > 0 ? 'meeting' : 'task',
      priority: profile.open_opportunity_count > 0 ? 'high' : 'normal',
    };
  };

  /**
   * Get prepopulated data for OpportunityForm
   */
  const getOpportunityFormData = () => {
    return {
      // Link to the contact/lead
      [entityType === 'contact' ? 'contact_id' : 'lead_id']: profile.person_id || profile.id,
      // Pre-fill account if available
      account_id: profile.account_id || '',
      // Add context in description
      description: profile.ai_summary ? `Opportunity for ${profile.first_name} ${profile.last_name}: ${profile.ai_summary.substring(0, 150)}...` : `Opportunity for ${profile.first_name} ${profile.last_name}`,
      // Use lead source from profile if available
      lead_source: 'existing_contact',
      // Set stage to prospecting by default
      stage: 'prospecting',
    };
  };

  /**
   * Get prepopulated data for Note/NoteForm
   */
  const getNoteFormData = () => {
    return {
      // Link to the entity
      related_to: entityType, // 'lead' or 'contact'
      related_id: profile.person_id || profile.id,
      // Suggest a context-aware title
      title: `Note about ${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      // Pre-populate with context
      content: profile.ai_summary 
        ? `Based on AI Summary:\n${profile.ai_summary}\n\nAdditional notes:\n`
        : `Note about ${profile.first_name || ''} ${profile.last_name || ''}:\n`,
    };
  };

  /**
   * Get prepopulated data for ContactForm/LeadForm when editing from profile
   */
  const getEditFormData = () => {
    return {
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      job_title: profile.job_title || '',
      account_id: profile.account_id || '',
      account_name: profile.account_name || '',
      status: profile.status || 'new',
      assigned_to: profile.assigned_to || '',
    };
  };

  /**
   * Helper to get context summary for forms
   */
  const getContextSummary = () => {
    return {
      personName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      accountName: profile.account_name || 'Unknown Account',
      status: profile.status,
      hasOpenOpportunities: profile.open_opportunity_count > 0,
      opportunityCount: profile.open_opportunity_count || 0,
      lastActivity: profile.last_activity_at,
      assignedTo: profile.assigned_to,
    };
  };

  return {
    getActivityFormData,
    getOpportunityFormData,
    getNoteFormData,
    getEditFormData,
    getContextSummary,
  };
}
