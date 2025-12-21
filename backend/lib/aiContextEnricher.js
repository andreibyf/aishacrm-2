/**
 * AI Context Enricher for v2 API endpoints
 * 
 * Provides aiContext objects per Phase 4 spec:
 * - confidence: 0.0 to 1.0
 * - suggestions: ActionSuggestion[]
 * - predictions: entity-specific predictions
 * - insights: string[]
 * - relatedItems: RelatedItem[]
 * - processingTime: ms
 */

import { getSupabaseClient } from './supabase-db.js';

const ENABLE_AI_ENRICHMENT = process.env.AI_ENRICHMENT_ENABLED !== 'false';
const _AI_ENRICHMENT_TIMEOUT = parseInt(process.env.AI_ENRICHMENT_TIMEOUT_MS || '500', 10); // Reserved for future timeout
const SLOW_THRESHOLD_MS = parseInt(process.env.AI_CONTEXT_SLOW_THRESHOLD_MS || '500', 10);

/**
 * Log warning if AI context enrichment exceeds threshold
 */
function warnIfSlow(entityType, entityId, processingTime) {
  if (processingTime > SLOW_THRESHOLD_MS) {
    console.warn(`[aiContextEnricher] SLOW: ${entityType} ${entityId || 'unknown'} took ${processingTime}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`);
  }
}

/**
 * Build AI context for an Opportunity
 */
export async function buildOpportunityAiContext(opportunity, _options = {}) {
  const startTime = Date.now();
  
  if (!opportunity || !ENABLE_AI_ENRICHMENT) {
    return createStubContext('opportunity', startTime);
  }

  try {
    const supabase = getSupabaseClient();
    const { tenant_id, id, account_id, contact_id, stage: _stage, amount: _amount, probability: _probability, close_date } = opportunity;

    // Fetch related data in parallel
    const [activitiesResult, accountResult, contactResult] = await Promise.all([
      supabase
        .from('activities')
        .select('id, type, subject, status, due_date, created_at')
        .eq('tenant_id', tenant_id)
        .eq('related_id', id)
        .order('created_at', { ascending: false })
        .limit(5),
      account_id ? supabase.from('accounts').select('id, name, industry, annual_revenue').eq('id', account_id).single() : null,
      contact_id ? supabase.from('contacts').select('id, first_name, last_name, email, job_title').eq('id', contact_id).single() : null,
    ]);

    const activities = activitiesResult?.data || [];
    const account = accountResult?.data;
    const contact = contactResult?.data;

    // Calculate deal health
    const dealHealth = calculateDealHealth(opportunity, activities);
    
    // Calculate win probability (enhanced from base probability)
    const winProbability = calculateWinProbability(opportunity, activities, account);
    
    // Generate suggestions
    const suggestions = generateOpportunitySuggestions(opportunity, activities, contact);
    
    // Generate insights
    const insights = generateOpportunityInsights(opportunity, activities, account, contact);
    
    // Build related items
    const relatedItems = [];
    if (account) {
      relatedItems.push({ type: 'account', id: account.id, name: account.name });
    }
    if (contact) {
      relatedItems.push({ type: 'contact', id: contact.id, name: `${contact.first_name} ${contact.last_name}` });
    }
    activities.slice(0, 3).forEach(act => {
      relatedItems.push({ type: 'activity', id: act.id, name: act.subject || act.type });
    });

    const processingTime = Date.now() - startTime;
    warnIfSlow('opportunity', opportunity.id, processingTime);

    return {
      confidence: 0.85,
      suggestions,
      predictions: {
        dealHealth,
        winProbability,
        daysToClose: close_date ? Math.max(0, Math.ceil((new Date(close_date) - new Date()) / (1000 * 60 * 60 * 24))) : null,
        riskLevel: dealHealth === 'at_risk' ? 'high' : dealHealth === 'stalled' ? 'medium' : 'low',
      },
      insights,
      relatedItems,
      processingTime,
    };
  } catch (error) {
    console.error('[aiContextEnricher] Opportunity enrichment error:', error.message);
    return createStubContext('opportunity', startTime, error.message);
  }
}

/**
 * Build AI context for an Activity
 */
export async function buildActivityAiContext(activity, _options = {}) {
  const startTime = Date.now();
  
  if (!activity || !ENABLE_AI_ENRICHMENT) {
    return createStubContext('activity', startTime);
  }

  try {
    const supabase = getSupabaseClient();
    const { tenant_id: _tenant_id, related_type, related_id, type: _type, status, due_date: _due_date } = activity;

    // Fetch related entity
    let relatedEntity = null;
    if (related_type && related_id) {
      const tableName = related_type === 'opportunity' ? 'opportunities' : 
                        related_type === 'account' ? 'accounts' :
                        related_type === 'contact' ? 'contacts' :
                        related_type === 'lead' ? 'leads' : null;
      if (tableName) {
        const { data } = await supabase.from(tableName).select('id, name, first_name, last_name').eq('id', related_id).single();
        relatedEntity = data;
      }
    }

    // Generate suggestions based on activity type and status
    const suggestions = generateActivitySuggestions(activity, relatedEntity);
    
    // Generate insights
    const insights = generateActivityInsights(activity);

    const relatedItems = [];
    if (relatedEntity) {
      const entityName = relatedEntity.name || `${relatedEntity.first_name || ''} ${relatedEntity.last_name || ''}`.trim();
      relatedItems.push({ type: related_type, id: related_id, name: entityName });
    }

    const processingTime = Date.now() - startTime;
    warnIfSlow('activity', activity.id, processingTime);

    return {
      confidence: 0.80,
      suggestions,
      predictions: {
        urgency: calculateActivityUrgency(activity),
        completionLikelihood: status === 'completed' ? 1.0 : status === 'in_progress' ? 0.7 : 0.4,
      },
      insights,
      relatedItems,
      processingTime,
    };
  } catch (error) {
    console.error('[aiContextEnricher] Activity enrichment error:', error.message);
    return createStubContext('activity', startTime, error.message);
  }
}

/**
 * Build AI context for a Contact
 */
export async function buildContactAiContext(contact, _options = {}) {
  const startTime = Date.now();
  
  if (!contact || !ENABLE_AI_ENRICHMENT) {
    return createStubContext('contact', startTime);
  }

  try {
    const supabase = getSupabaseClient();
    const { tenant_id, id, account_id, email: _email, job_title } = contact;

    // Fetch related data
    const [activitiesResult, accountResult, opportunitiesResult] = await Promise.all([
      supabase
        .from('activities')
        .select('id, type, subject, status, created_at')
        .eq('tenant_id', tenant_id)
        .eq('related_id', id)
        .order('created_at', { ascending: false })
        .limit(5),
      account_id ? supabase.from('accounts').select('id, name, industry').eq('id', account_id).single() : null,
      supabase
        .from('opportunities')
        .select('id, name, stage, amount')
        .eq('tenant_id', tenant_id)
        .eq('contact_id', id)
        .limit(5),
    ]);

    const activities = activitiesResult?.data || [];
    const account = accountResult?.data;
    const opportunities = opportunitiesResult?.data || [];

    // Calculate engagement score
    const engagementScore = calculateEngagementScore(activities);
    
    // Detect seniority from job title
    const seniority = detectSeniority(job_title);

    const suggestions = generateContactSuggestions(contact, activities, opportunities);
    const insights = generateContactInsights(contact, activities, account, seniority);

    const relatedItems = [];
    if (account) {
      relatedItems.push({ type: 'account', id: account.id, name: account.name });
    }
    opportunities.slice(0, 3).forEach(opp => {
      relatedItems.push({ type: 'opportunity', id: opp.id, name: opp.name });
    });

    const processingTime = Date.now() - startTime;
    warnIfSlow('contact', contact.id, processingTime);

    return {
      confidence: 0.82,
      suggestions,
      predictions: {
        engagementScore,
        seniority,
        bestContactTime: null, // Would need historical data
        responseRate: activities.length > 0 ? 0.6 : null,
      },
      insights,
      relatedItems,
      processingTime,
    };
  } catch (error) {
    console.error('[aiContextEnricher] Contact enrichment error:', error.message);
    return createStubContext('contact', startTime, error.message);
  }
}

/**
 * Build AI context for an Account
 */
export async function buildAccountAiContext(account, _options = {}) {
  const startTime = Date.now();
  
  if (!account || !ENABLE_AI_ENRICHMENT) {
    return createStubContext('account', startTime);
  }

  try {
    const supabase = getSupabaseClient();
    const { tenant_id, id, industry: _industry, annual_revenue } = account;

    // Fetch related data
    const [contactsResult, opportunitiesResult, activitiesResult] = await Promise.all([
      supabase.from('contacts').select('id, first_name, last_name, email, job_title').eq('account_id', id).limit(10),
      supabase.from('opportunities').select('id, name, stage, amount, probability').eq('account_id', id).limit(10),
      supabase.from('activities').select('id, type, status, created_at').eq('tenant_id', tenant_id).eq('related_id', id).order('created_at', { ascending: false }).limit(10),
    ]);

    const contacts = contactsResult?.data || [];
    const opportunities = opportunitiesResult?.data || [];
    const activities = activitiesResult?.data || [];

    // Calculate account health
    const accountHealth = calculateAccountHealth(account, opportunities, activities);
    
    // Calculate total pipeline
    const pipelineValue = opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    const weightedPipeline = opportunities.reduce((sum, opp) => sum + ((opp.amount || 0) * (opp.probability || 0) / 100), 0);

    const suggestions = generateAccountSuggestions(account, contacts, opportunities, activities);
    const insights = generateAccountInsights(account, contacts, opportunities, activities);

    const relatedItems = [];
    contacts.slice(0, 3).forEach(c => {
      relatedItems.push({ type: 'contact', id: c.id, name: `${c.first_name} ${c.last_name}` });
    });
    opportunities.slice(0, 3).forEach(opp => {
      relatedItems.push({ type: 'opportunity', id: opp.id, name: opp.name });
    });

    const processingTime = Date.now() - startTime;
    warnIfSlow('account', account.id, processingTime);

    return {
      confidence: 0.85,
      suggestions,
      predictions: {
        accountHealth,
        pipelineValue,
        weightedPipeline,
        churnRisk: accountHealth === 'at_risk' ? 'high' : 'low',
        upsellPotential: annual_revenue > 100000 ? 'high' : annual_revenue > 50000 ? 'medium' : 'low',
      },
      insights,
      relatedItems,
      processingTime,
    };
  } catch (error) {
    console.error('[aiContextEnricher] Account enrichment error:', error.message);
    return createStubContext('account', startTime, error.message);
  }
}

/**
 * Build AI context for a Lead
 */
export async function buildLeadAiContext(lead, _options = {}) {
  const startTime = Date.now();
  
  if (!lead || !ENABLE_AI_ENRICHMENT) {
    return createStubContext('lead', startTime);
  }

  try {
    const supabase = getSupabaseClient();
    const { tenant_id, id, status, source: _source, company, score } = lead;

    // Fetch related activities
    const { data: activities } = await supabase
      .from('activities')
      .select('id, type, status, created_at')
      .eq('tenant_id', tenant_id)
      .eq('related_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Check for potential duplicates
    let duplicateHints = [];
    if (company) {
      const { data: similar } = await supabase
        .from('leads')
        .select('id, first_name, last_name, company')
        .eq('tenant_id', tenant_id)
        .ilike('company', `%${company}%`)
        .neq('id', id)
        .limit(3);
      duplicateHints = similar || [];
    }

    // Calculate lead score if not present
    const calculatedScore = score || calculateLeadScore(lead, activities || []);
    
    // Determine conversion probability
    const conversionProbability = calculateConversionProbability(lead, activities || []);

    const suggestions = generateLeadSuggestions(lead, activities || [], duplicateHints);
    const insights = generateLeadInsights(lead, activities || [], duplicateHints);

    const relatedItems = duplicateHints.map(d => ({
      type: 'lead',
      id: d.id,
      name: `${d.first_name} ${d.last_name}`,
      hint: 'potential_duplicate',
    }));

    const processingTime = Date.now() - startTime;
    warnIfSlow('lead', lead.id, processingTime);

    return {
      confidence: 0.78,
      suggestions,
      predictions: {
        leadScore: calculatedScore,
        conversionProbability,
        qualificationStatus: status === 'qualified' ? 'qualified' : conversionProbability > 0.6 ? 'likely_qualified' : 'needs_nurturing',
        estimatedTimeToConvert: conversionProbability > 0.7 ? '1-2 weeks' : conversionProbability > 0.4 ? '2-4 weeks' : '4+ weeks',
      },
      insights,
      relatedItems,
      processingTime,
    };
  } catch (error) {
    console.error('[aiContextEnricher] Lead enrichment error:', error.message);
    return createStubContext('lead', startTime, error.message);
  }
}

// ============ Helper Functions ============

function createStubContext(entityType, startTime, error = null) {
  return {
    confidence: 0,
    suggestions: [],
    predictions: null,
    insights: error ? [`AI enrichment unavailable: ${error}`] : ['AI enrichment disabled'],
    relatedItems: [],
    processingTime: Date.now() - startTime,
    _stub: true,
  };
}

function calculateDealHealth(opportunity, activities) {
  const { stage: _stage, close_date, updated_at } = opportunity;
  const daysSinceUpdate = updated_at ? Math.floor((Date.now() - new Date(updated_at)) / (1000 * 60 * 60 * 24)) : 999;
  const daysToClose = close_date ? Math.ceil((new Date(close_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  
  // Stalled: no activity in 14+ days
  if (daysSinceUpdate > 14 && activities.length === 0) return 'stalled';
  
  // At risk: close date passed or within 7 days with no recent activity
  if (daysToClose !== null && daysToClose < 0) return 'at_risk';
  if (daysToClose !== null && daysToClose < 7 && daysSinceUpdate > 7) return 'at_risk';
  
  // On track
  if (activities.length > 0 && daysSinceUpdate < 7) return 'on_track';
  
  return 'needs_attention';
}

function calculateWinProbability(opportunity, activities, account) {
  let base = opportunity.probability || 50;
  
  // Boost for recent activity
  if (activities.length > 0) {
    const recentActivity = activities.find(a => {
      const daysSince = (Date.now() - new Date(a.created_at)) / (1000 * 60 * 60 * 24);
      return daysSince < 7;
    });
    if (recentActivity) base += 5;
  }
  
  // Boost for known account
  if (account?.annual_revenue > 100000) base += 3;
  
  return Math.min(100, Math.max(0, base)) / 100;
}

function generateOpportunitySuggestions(opportunity, activities, contact) {
  const suggestions = [];
  const daysSinceUpdate = opportunity.updated_at ? 
    Math.floor((Date.now() - new Date(opportunity.updated_at)) / (1000 * 60 * 60 * 24)) : 999;

  if (daysSinceUpdate > 7) {
    suggestions.push({
      action: 'schedule_followup',
      priority: 'high',
      reason: `No activity in ${daysSinceUpdate} days`,
      confidence: 0.9,
    });
  }

  if (!contact) {
    suggestions.push({
      action: 'add_contact',
      priority: 'medium',
      reason: 'No primary contact assigned',
      confidence: 0.85,
    });
  }

  if (activities.length === 0) {
    suggestions.push({
      action: 'log_activity',
      priority: 'medium',
      reason: 'No activities logged for this opportunity',
      confidence: 0.8,
    });
  }

  return suggestions;
}

function generateOpportunityInsights(opportunity, activities, account, contact) {
  const insights = [];
  
  if (activities.length === 0) {
    insights.push('No activity history for this deal');
  }
  
  if (!contact) {
    insights.push('Consider adding a primary contact');
  }
  
  if (opportunity.amount && opportunity.amount > 50000 && activities.length < 3) {
    insights.push('High-value deal with limited engagement');
  }

  if (account?.industry) {
    insights.push(`Account operates in ${account.industry} industry`);
  }

  return insights;
}

function generateActivitySuggestions(activity, _relatedEntity) {
  const suggestions = [];
  const { status, due_date, type } = activity;

  if (status !== 'completed' && due_date) {
    const daysUntilDue = Math.ceil((new Date(due_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 0) {
      suggestions.push({
        action: 'complete_overdue_activity',
        priority: 'high',
        reason: `Activity is ${Math.abs(daysUntilDue)} days overdue`,
        confidence: 0.95,
      });
    } else if (daysUntilDue <= 1) {
      suggestions.push({
        action: 'prioritize_activity',
        priority: 'high',
        reason: 'Activity due soon',
        confidence: 0.9,
      });
    }
  }

  if (type === 'call' && status === 'completed') {
    suggestions.push({
      action: 'log_call_notes',
      priority: 'medium',
      reason: 'Document call outcomes',
      confidence: 0.75,
    });
  }

  return suggestions;
}

function generateActivityInsights(activity) {
  const insights = [];
  const { type: _type, status, due_date } = activity;

  if (status === 'overdue' || (due_date && new Date(due_date) < new Date() && status !== 'completed')) {
    insights.push('This activity is overdue');
  }

  return insights;
}

function calculateActivityUrgency(activity) {
  const { status, due_date } = activity;
  if (status === 'completed') return 'none';
  if (!due_date) return 'low';
  
  const daysUntilDue = Math.ceil((new Date(due_date) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 0) return 'critical';
  if (daysUntilDue <= 1) return 'high';
  if (daysUntilDue <= 3) return 'medium';
  return 'low';
}

function calculateEngagementScore(activities) {
  if (!activities.length) return 0;
  
  const recentCount = activities.filter(a => {
    const daysSince = (Date.now() - new Date(a.created_at)) / (1000 * 60 * 60 * 24);
    return daysSince < 30;
  }).length;

  return Math.min(100, recentCount * 20);
}

function detectSeniority(jobTitle) {
  if (!jobTitle) return 'unknown';
  const title = jobTitle.toLowerCase();
  
  if (title.includes('ceo') || title.includes('cto') || title.includes('cfo') || 
      title.includes('chief') || title.includes('president') || title.includes('owner')) {
    return 'executive';
  }
  if (title.includes('vp') || title.includes('vice president') || title.includes('director')) {
    return 'senior';
  }
  if (title.includes('manager') || title.includes('lead') || title.includes('head')) {
    return 'mid';
  }
  return 'individual';
}

function generateContactSuggestions(contact, activities, opportunities) {
  const suggestions = [];

  if (activities.length === 0) {
    suggestions.push({
      action: 'schedule_introduction',
      priority: 'medium',
      reason: 'No interactions recorded with this contact',
      confidence: 0.8,
    });
  }

  if (opportunities.length > 0 && activities.length === 0) {
    suggestions.push({
      action: 'engage_contact',
      priority: 'high',
      reason: 'Contact linked to opportunities but no recent engagement',
      confidence: 0.85,
    });
  }

  return suggestions;
}

function generateContactInsights(contact, activities, account, seniority) {
  const insights = [];

  if (seniority === 'executive') {
    insights.push('Executive-level contact - high-value relationship');
  }

  if (account?.industry) {
    insights.push(`Works at a ${account.industry} company`);
  }

  if (!contact.email) {
    insights.push('Missing email address');
  }

  return insights;
}

function calculateAccountHealth(account, opportunities, activities) {
  const hasActiveOpps = opportunities.some(o => o.stage !== 'closed_won' && o.stage !== 'closed_lost');
  const recentActivity = activities.some(a => {
    const daysSince = (Date.now() - new Date(a.created_at)) / (1000 * 60 * 60 * 24);
    return daysSince < 30;
  });

  if (hasActiveOpps && recentActivity) return 'healthy';
  if (hasActiveOpps || recentActivity) return 'needs_attention';
  if (activities.length === 0 && opportunities.length === 0) return 'new';
  return 'at_risk';
}

function generateAccountSuggestions(account, contacts, opportunities, activities) {
  const suggestions = [];

  if (contacts.length === 0) {
    suggestions.push({
      action: 'add_contacts',
      priority: 'high',
      reason: 'No contacts associated with this account',
      confidence: 0.9,
    });
  }

  if (opportunities.length === 0 && contacts.length > 0) {
    suggestions.push({
      action: 'create_opportunity',
      priority: 'medium',
      reason: 'Account has contacts but no opportunities',
      confidence: 0.75,
    });
  }

  const daysSinceActivity = activities.length > 0 ?
    Math.floor((Date.now() - new Date(activities[0].created_at)) / (1000 * 60 * 60 * 24)) : 999;
  
  if (daysSinceActivity > 30) {
    suggestions.push({
      action: 'schedule_touchpoint',
      priority: 'medium',
      reason: `No activity in ${daysSinceActivity} days`,
      confidence: 0.8,
    });
  }

  return suggestions;
}

function generateAccountInsights(account, contacts, opportunities, _activities) {
  const insights = [];

  if (contacts.length > 0) {
    const executives = contacts.filter(c => detectSeniority(c.job_title) === 'executive');
    if (executives.length > 0) {
      insights.push(`${executives.length} executive-level contact(s)`);
    }
  }

  const totalPipeline = opportunities.reduce((sum, o) => sum + (o.amount || 0), 0);
  if (totalPipeline > 0) {
    insights.push(`Total pipeline: $${totalPipeline.toLocaleString()}`);
  }

  if (account.annual_revenue) {
    insights.push(`Annual revenue: $${account.annual_revenue.toLocaleString()}`);
  }

  return insights;
}

function calculateLeadScore(lead, activities) {
  let score = 30; // Base score

  // Source quality
  const highValueSources = ['referral', 'website', 'demo_request'];
  if (highValueSources.includes(lead.source?.toLowerCase())) score += 20;

  // Has email
  if (lead.email) score += 10;

  // Has phone
  if (lead.phone) score += 5;

  // Has company
  if (lead.company) score += 10;

  // Activity engagement
  if (activities.length > 0) score += 15;
  if (activities.length > 3) score += 10;

  return Math.min(100, score);
}

function calculateConversionProbability(lead, activities) {
  const score = lead.score || calculateLeadScore(lead, activities);
  
  // Status-based adjustments
  if (lead.status === 'qualified') return 0.75;
  if (lead.status === 'contacted') return 0.45;
  if (lead.status === 'new') return 0.25;
  
  return score / 100 * 0.8;
}

function generateLeadSuggestions(lead, activities, duplicateHints) {
  const suggestions = [];

  if (duplicateHints.length > 0) {
    suggestions.push({
      action: 'review_duplicates',
      priority: 'high',
      reason: `${duplicateHints.length} potential duplicate(s) found`,
      confidence: 0.7,
    });
  }

  if (lead.status === 'new' && activities.length === 0) {
    suggestions.push({
      action: 'make_first_contact',
      priority: 'high',
      reason: 'New lead awaiting initial outreach',
      confidence: 0.9,
    });
  }

  if (lead.status === 'contacted' && activities.length > 2) {
    suggestions.push({
      action: 'qualify_lead',
      priority: 'medium',
      reason: 'Multiple touchpoints - ready for qualification',
      confidence: 0.75,
    });
  }

  return suggestions;
}

function generateLeadInsights(lead, activities, duplicateHints) {
  const insights = [];

  if (duplicateHints.length > 0) {
    insights.push(`Potential duplicates at ${duplicateHints.map(d => d.company).join(', ')}`);
  }

  if (!lead.email && !lead.phone) {
    insights.push('Missing contact information (no email or phone)');
  }

  if (lead.source) {
    insights.push(`Lead source: ${lead.source}`);
  }

  return insights;
}

export default {
  buildOpportunityAiContext,
  buildActivityAiContext,
  buildContactAiContext,
  buildAccountAiContext,
  buildLeadAiContext,
};
