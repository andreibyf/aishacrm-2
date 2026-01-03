import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseFactory.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createDashboardFunnelRoutes(_pgPool) {
  const router = express.Router();

  // Lazy-load Supabase client to avoid initialization errors when credentials not configured
  const getSupabase = () => getSupabaseAdmin({ throwOnMissing: false }) || getSupabaseAdmin();

  /**
   * GET /api/dashboard/funnel-counts
 * Returns pre-computed funnel counts AND pipeline data from materialized view
 * Query params:
 *   - include_test_data: boolean (default: true)
 *   - period: string (year|quarter|month|week) - optional
 *   - year: number - required if period is set
 *   - quarter: number (1-4) - required if period=quarter
 *   - month: number (1-12) - required if period=month
 *   - week: number (1-53) - required if period=week
 */
router.get('/funnel-counts', cacheList('funnel_counts', 120), validateTenantAccess, async (req, res) => {
  try {
    const supabase = getSupabase();
    const tenantId = req.tenant?.id || req.query.tenant_id;
    const includeTestData = req.query.include_test_data !== 'false';
    const period = req.query.period; // year|quarter|month|week
    const year = parseInt(req.query.year);
    const quarter = parseInt(req.query.quarter);
    const month = parseInt(req.query.month);
    const week = parseInt(req.query.week);

    if (!tenantId) {
      return res.status(400).json({ 
        error: 'Tenant ID required',
        message: 'Cannot fetch funnel counts without tenant context'
      });
    }

    // Use period-based view if period filter is specified
    if (period && year) {
      let query = supabase
        .from('dashboard_funnel_counts_by_period')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('period_year', year);

      // Add period-specific filters
      if (period === 'quarter' && quarter) {
        query = query.eq('period_quarter', quarter);
      } else if (period === 'month' && month) {
        query = query.eq('period_month', month);
      } else if (period === 'week' && week) {
        query = query.eq('period_week', week);
      }

      const { data: periodData, error: periodError } = await query;

      if (periodError) throw periodError;

      // Aggregate the period data
      const suffix = includeTestData ? '_total' : '_real';
      
      const aggregated = (periodData || []).reduce((acc, row) => {
        acc.funnel.sources += row[`sources${suffix}`] || 0;
        acc.funnel.leads += row[`leads${suffix}`] || 0;
        acc.funnel.contacts += row[`contacts${suffix}`] || 0;
        acc.funnel.accounts += row[`accounts${suffix}`] || 0;
        
        acc.pipeline[0].count += row[`prospecting_count${suffix}`] || 0;
        acc.pipeline[0].value += parseFloat(row[`prospecting_value${suffix}`]) || 0;
        acc.pipeline[1].count += row[`qualification_count${suffix}`] || 0;
        acc.pipeline[1].value += parseFloat(row[`qualification_value${suffix}`]) || 0;
        acc.pipeline[2].count += row[`proposal_count${suffix}`] || 0;
        acc.pipeline[2].value += parseFloat(row[`proposal_value${suffix}`]) || 0;
        acc.pipeline[3].count += row[`negotiation_count${suffix}`] || 0;
        acc.pipeline[3].value += parseFloat(row[`negotiation_value${suffix}`]) || 0;
        acc.pipeline[4].count += row[`closed_won_count${suffix}`] || 0;
        acc.pipeline[4].value += parseFloat(row[`closed_won_value${suffix}`]) || 0;
        acc.pipeline[5].count += row[`closed_lost_count${suffix}`] || 0;
        acc.pipeline[5].value += parseFloat(row[`closed_lost_value${suffix}`]) || 0;
        
        return acc;
      }, {
        funnel: { sources: 0, leads: 0, contacts: 0, accounts: 0 },
        pipeline: [
          { stage: 'Prospecting', count: 0, value: 0 },
          { stage: 'Qualification', count: 0, value: 0 },
          { stage: 'Proposal', count: 0, value: 0 },
          { stage: 'Negotiation', count: 0, value: 0 },
          { stage: 'Closed Won', count: 0, value: 0 },
          { stage: 'Closed Lost', count: 0, value: 0 },
        ]
      });

      return res.json({
        ...aggregated,
        period: period,
        year: year,
        quarter: quarter,
        month: month,
        week: week,
        last_refreshed: periodData?.[0]?.last_refreshed,
        cached: true
      });
    }

    // Default: Query all-time aggregated view
    const { data, error } = await supabase
      .from('dashboard_funnel_counts')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      // If view doesn't exist or no data, return zeros
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        return res.json({
          funnel: {
            sources: 0,
            leads: 0,
            contacts: 0,
            accounts: 0,
          },
          pipeline: [],
          last_refreshed: null,
          cached: false
        });
      }
      throw error;
    }

    // Return appropriate counts based on test data flag
    const suffix = includeTestData ? '_total' : '_real';
    
    // Return funnel with both suffixed fields for frontend compatibility
    const funnelCounts = {
      sources_total: data.sources_total || 0,
      sources_real: data.sources_real || 0,
      sources_test: data.sources_test || 0,
      leads_total: data.leads_total || 0,
      leads_real: data.leads_real || 0,
      leads_test: data.leads_test || 0,
      contacts_total: data.contacts_total || 0,
      contacts_real: data.contacts_real || 0,
      contacts_test: data.contacts_test || 0,
      accounts_total: data.accounts_total || 0,
      accounts_real: data.accounts_real || 0,
      accounts_test: data.accounts_test || 0,
    };

    // Build pipeline array with stage data (suffixed for frontend)
    const pipeline = [
      {
        stage: 'prospecting',
        count_total: data.prospecting_count_total || 0,
        count_real: data.prospecting_count_real || 0,
        count_test: data.prospecting_count_test || 0,
        value_total: parseFloat(data.prospecting_value_total) || 0,
        value_real: parseFloat(data.prospecting_value_real) || 0,
        value_test: parseFloat(data.prospecting_value_test) || 0,
      },
      {
        stage: 'qualification',
        count_total: data.qualification_count_total || 0,
        count_real: data.qualification_count_real || 0,
        count_test: data.qualification_count_test || 0,
        value_total: parseFloat(data.qualification_value_total) || 0,
        value_real: parseFloat(data.qualification_value_real) || 0,
        value_test: parseFloat(data.qualification_value_test) || 0,
      },
      {
        stage: 'proposal',
        count_total: data.proposal_count_total || 0,
        count_real: data.proposal_count_real || 0,
        count_test: data.proposal_count_test || 0,
        value_total: parseFloat(data.proposal_value_total) || 0,
        value_real: parseFloat(data.proposal_value_real) || 0,
        value_test: parseFloat(data.proposal_value_test) || 0,
      },
      {
        stage: 'negotiation',
        count_total: data.negotiation_count_total || 0,
        count_real: data.negotiation_count_real || 0,
        count_test: data.negotiation_count_test || 0,
        value_total: parseFloat(data.negotiation_value_total) || 0,
        value_real: parseFloat(data.negotiation_value_real) || 0,
        value_test: parseFloat(data.negotiation_value_test) || 0,
      },
      {
        stage: 'closed_won',
        count_total: data.closed_won_count_total || 0,
        count_real: data.closed_won_count_real || 0,
        count_test: data.closed_won_count_test || 0,
        value_total: parseFloat(data.closed_won_value_total) || 0,
        value_real: parseFloat(data.closed_won_value_real) || 0,
        value_test: parseFloat(data.closed_won_value_test) || 0,
      },
      {
        stage: 'closed_lost',
        count_total: data.closed_lost_count_total || 0,
        count_real: data.closed_lost_count_real || 0,
        count_test: data.closed_lost_count_test || 0,
        value_total: parseFloat(data.closed_lost_value_total) || 0,
        value_real: parseFloat(data.closed_lost_value_real) || 0,
        value_test: parseFloat(data.closed_lost_value_test) || 0,
      },
    ];

    res.json({
      funnel: funnelCounts,
      pipeline: pipeline,
      last_refreshed: data.last_refreshed,
      cached: true
    });

  } catch (error) {
    logger.error('[Dashboard Funnel] Error fetching counts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch funnel counts',
      message: error.message 
    });
  }
});

/**
 * POST /api/dashboard/funnel-counts/refresh
 * Manually refresh the materialized view (admin only)
 */
router.post('/funnel-counts/refresh', validateTenantAccess, async (req, res) => {
  try {
    const supabase = getSupabase();
    // Call the refresh function
    const { error } = await supabase.rpc('refresh_dashboard_funnel_counts');

    if (error) throw error;

    res.json({ 
      success: true, 
      message: 'Funnel counts refreshed successfully',
      refreshed_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard Funnel] Error refreshing counts:', error);
    res.status(500).json({ 
      error: 'Failed to refresh funnel counts',
      message: error.message 
    });
  }
});

  return router;
}
