import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

const router = express.Router();

/**
 * Generate AI summary for a person profile
 * POST /api/ai/summarize-person-profile
 * Body: { person_id, person_type, profile_data, tenant_id }
 */
router.post('/summarize-person-profile', async (req, res) => {
  try {
    const { person_id, person_type, profile_data, tenant_id } = req.body;
    const supabase = getSupabaseClient();

    if (!person_id || !person_type || !profile_data) {
      return res.status(400).json({ error: 'Missing required fields: person_id, person_type, profile_data' });
    }

    // Check if a fresh summary exists (cache for 24 hours)
    // Note: ai_summary_updated_at column may not exist in older schemas; gracefully handle
    const existingSummary = await supabase
      .from('person_profile')
      .select('ai_summary')
      .eq('person_id', person_id)
      .single();

    if (existingSummary.data && existingSummary.data.ai_summary) {
      // Handle both text and text[] types
      const existingSummaryText = Array.isArray(existingSummary.data.ai_summary) 
        ? existingSummary.data.ai_summary.join(' ')
        : existingSummary.data.ai_summary;
      
      if (existingSummaryText) {
        // For now, always regenerate since ai_summary_updated_at column may not exist
        // TODO: Once migration is applied, add cache check
        logger.debug(`[AI Summary] Found existing summary for ${person_id}; using fallback for now`);
      }
    }

    // Build context for AI from profile data
    const context = buildProfileContext(profile_data, person_type);

    // Call AI to generate summary
    const prompt = `You are a CRM analyst. Generate a concise executive summary (2-3 sentences) for this ${person_type} profile based on the following information:

${context}

Focus on:
- Key business context
- Recent activity patterns
- Next steps or opportunities
- Any red flags or important notes

Keep it professional and actionable.`;

    logger.debug(`[AI Summary] Generating new summary for ${person_id}...`);
    
    // Generate summary using fallback (AI integration TODO for future)
    // TODO: Integrate with LLM provider via selectLLMConfigForTenant + generateChatCompletion
    // For now, use fallback summary from profile data to unblock the feature
    const ai_summary = generateFallbackSummary(profile_data, person_type);
    
    if (!ai_summary) {
      logger.warn('[AI Summary] Failed to generate fallback summary');
      return res.status(400).json({ error: 'Could not generate AI summary' });
    }
    
    logger.debug('[AI Summary] Generated fallback summary for ' + person_id);

    // Store summary in database
    // Note: ai_summary may be typed as text[] array in Supabase; wrap if needed
    // ai_summary_updated_at column update commented out until migration is applied
    const summaryValue = Array.isArray(ai_summary) ? ai_summary : [ai_summary];
    
    await supabase
      .from('person_profile')
      .update({
        ai_summary: summaryValue,
        // ai_summary_updated_at: new Date().toISOString(),  // TODO: Enable after migration
      })
      .eq('person_id', person_id)
      .throwOnError();

    return res.json({ ai_summary });
  } catch (err) {
    logger.error('[AI Summary] Error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate AI summary', details: err?.message });
  }
});

/**
 * Generate a forward-looking summary with recommendations from profile data
 */
function generateFallbackSummary(profile, personType) {
  const summary = [];
  
  // Add key info
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  if (name) summary.push(`${name}`);
  
  if (profile.job_title) summary.push(`${profile.job_title}`);
  if (profile.account_name) summary.push(`at ${profile.account_name}`);
  
  // Build initial context
  let intro = summary.join(' ');
  if (!intro) intro = `${personType} profile`;
  
  const recommendations = [];
  
  // Analyze engagement and activity
  const lastActivity = profile.last_activity_at ? new Date(profile.last_activity_at) : null;
  const now = new Date();
  const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24)) : null;
  
  if (daysSinceActivity !== null) {
    if (daysSinceActivity > 30) {
      recommendations.push(`No activity for ${daysSinceActivity} days—consider re-engagement outreach`);
    } else if (daysSinceActivity > 14) {
      recommendations.push(`Last active ${daysSinceActivity} days ago—follow-up recommended`);
    }
  }
  
  // Check for overdue tasks/activities
  if (profile.activities && Array.isArray(profile.activities)) {
    const overdueTasks = profile.activities.filter(a => 
      a.status === 'overdue' || a.status === 'Overdue' || 
      (a.due_date && new Date(a.due_date) < now && a.status !== 'completed')
    );
    if (overdueTasks.length > 0) {
      recommendations.push(`⚠️ ${overdueTasks.length} overdue task(s) requiring immediate attention`);
    }
  }
  
  // Analyze opportunities
  const openOppCount = profile.open_opportunity_count || 0;
  if (openOppCount > 0) {
    if (openOppCount === 1) {
      recommendations.push(`1 open opportunity to advance`);
    } else if (openOppCount > 1) {
      recommendations.push(`${openOppCount} open opportunities—prioritize next steps`);
    }
  }
  
  // Status-based recommendations
  if (profile.status === 'Cold' || profile.status === 'cold') {
    recommendations.push(`Currently cold—initiate contact strategy`);
  } else if (profile.status === 'Warm' || profile.status === 'warm') {
    recommendations.push(`Warm lead—timely follow-up could advance deal`);
  } else if (profile.status === 'Hot' || profile.status === 'hot') {
    recommendations.push(`Hot lead—prioritize immediate engagement`);
  }
  
  // Compile final summary
  const result = [intro];
  
  if (recommendations.length > 0) {
    result.push(`Key Actions: ${recommendations.join('; ')}.`);
  }
  
  return result.join(' ');
}

/**
 * Build context string from profile data for AI analysis
 */
function buildProfileContext(profile, _personType) {
  const lines = [];

  // Basic info
  if (profile.first_name || profile.last_name) {
    lines.push(`Name: ${profile.first_name} ${profile.last_name}`.trim());
  }
  if (profile.job_title) lines.push(`Position: ${profile.job_title}`);
  if (profile.account_name) lines.push(`Company: ${profile.account_name}`);
  if (profile.status) lines.push(`Status: ${profile.status}`);

  // Contact info
  if (profile.email) lines.push(`Email: ${profile.email}`);
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);

  // Activity
  if (profile.last_activity_at) lines.push(`Last Activity: ${profile.last_activity_at}`);
  if (profile.updated_at) lines.push(`Last Updated: ${profile.updated_at}`);

  // Opportunities
  if (profile.open_opportunity_count) {
    lines.push(`Open Opportunities: ${profile.open_opportunity_count}`);
  }
  if (profile.opportunity_stage && profile.opportunity_stage.length > 0) {
    lines.push(`Opportunity Stages: ${profile.opportunity_stage.join(', ')}`);
  }

  // Recent notes
  if (profile.notes && profile.notes.length > 0) {
    lines.push(`Recent Notes (${profile.notes.length}):`);
    profile.notes.slice(0, 3).forEach((note) => {
      lines.push(`  - "${note.title}": ${note.content.substring(0, 100)}...`);
    });
  }

  // Recent activities
  if (profile.activities && profile.activities.length > 0) {
    lines.push(`Recent Activities (${profile.activities.length}):`);
    profile.activities.slice(0, 3).forEach((activity) => {
      lines.push(`  - [${activity.status}] ${activity.subject}`);
    });
  }

  return lines.join('\n');
}

export default router;
