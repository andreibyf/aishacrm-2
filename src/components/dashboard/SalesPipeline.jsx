
import React, { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, AlertTriangle, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { useApiManager } from "@/components/shared/ApiManager";
import { Opportunity } from "@/api/entities";
import { useUser } from "@/components/shared/useUser";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { Link } from "react-router-dom"; // Added import
import { createPageUrl } from "@/utils"; // Added import
import { Button } from "@/components/ui/button"; // Added import for Button component
import { getDashboardFunnelCounts } from '@/api/fallbackFunctions';

function SalesPipeline(props) {
  const [pipelineData, setPipelineData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const loadingRef = useRef(false);
  const { cachedRequest } = useApiManager();
  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const { getVisibleCardsForEntity } = useStatusCardPreferences();
  const { plural: opportunitiesLabel } = useEntityLabel('opportunities');

  // Get visible opportunity stages from preferences
  const visibleOpportunityCards = useMemo(() => getVisibleCardsForEntity('opportunities'), [getVisibleCardsForEntity]);

  React.useEffect(() => {
        // Wait for user to be loaded before fetching data
        if (userLoading || !authCookiesReady) {
          return;
        }

    // Prevent duplicate simultaneous requests
    if (loadingRef.current) {
      return;
    }

    let mounted = true; // Flag to prevent state updates on unmounted component

    // Map status card IDs to stage keys
    const stageKeyMap = {
      'prospecting': 'prospecting',
      'qualification': 'qualification',
      'proposal': 'proposal',
      'negotiation': 'negotiation',
      'won': 'closed_won',
      'lost': 'closed_lost',
    };

    // Build visible stages from preferences
    const visibleStageKeys = new Set(
      visibleOpportunityCards.map(card => stageKeyMap[card.statusKey] || card.statusKey)
    );

    // Helper function to compute pipeline data from a list of opportunities
    const computeFromOpps = (opps) => {
      // Canonical stage buckets (include legacy mappings for won/lost)
      const stages = {
        prospecting: { name: "Prospecting", count: 0, value: 0, key: 'prospecting' },
        qualification: { name: "Qualification", count: 0, value: 0, key: 'qualification' },
        proposal: { name: "Proposal", count: 0, value: 0, key: 'proposal' },
        negotiation: { name: "Negotiation", count: 0, value: 0, key: 'negotiation' },
        closed_won: { name: "Closed Won", count: 0, value: 0, key: 'closed_won' },
        closed_lost: { name: "Closed Lost", count: 0, value: 0, key: 'closed_lost' },
      };

      const stageAliasMap = {
        won: "closed_won",
        lost: "closed_lost",
        closedwon: "closed_won",
        closedlost: "closed_lost",
      };

      (opps || []).forEach((opp) => {
        let stageKey = opp.stage;
        if (stageAliasMap[stageKey]) stageKey = stageAliasMap[stageKey];
        if (stages[stageKey]) {
          stages[stageKey].count++;
          const amount = parseFloat(opp.amount) || 0;
          stages[stageKey].value += amount;
          
          // Debug logging for Labor Depot
          if (amount === 0 && opp.amount !== 0 && opp.amount !== null) {
            console.log('[SalesPipeline] Opportunity with non-zero amount parsed as 0:', {
              name: opp.name,
              rawAmount: opp.amount,
              amountType: typeof opp.amount,
              parsedAmount: amount,
              stage: stageKey
            });
          }
        }
      });

      // Filter to only visible stages based on preferences
      const processedData = Object.entries(stages)
        .filter(([key]) => visibleStageKeys.has(key))
        .map(([, stage]) => ({
          stage: stage.name,
          value: stage.value,
          count: stage.count,
        }));

      // If all values are zero but there are counts, fall back to using counts
      const allValuesZero = processedData.every((s) => s.value === 0);
      if (allValuesZero && processedData.some((s) => s.count > 0)) {
        return processedData.map((s) => ({ stage: s.stage, value: s.count, isCount: true }));
      }
      return processedData;
    };

    const load = async () => {
      loadingRef.current = true;
      setLoading(true); // Start loading
      setErrorMessage(null); // Clear any previous errors

      try {
        // If preloaded (scoped) opportunities provided, use them directly
        if (Array.isArray(props?.prefetchedOpportunities)) {
          if (mounted) {
            setPipelineData(computeFromOpps(props.prefetchedOpportunities));
            setLoading(false);
          }
          // Background refresh to hydrate with full data silently
          (async () => {
            try {
              const tenantFilter = props?.tenantFilter || {};
              if (!tenantFilter.tenant_id) return;
              const showTestData = props?.showTestData;
              const effectiveFilter = showTestData ? { ...tenantFilter } : { ...tenantFilter, is_test_data: false };
              const hasFilter = Object.keys(effectiveFilter).length > 0;
              const methodName = hasFilter ? "filter" : "list";
              const methodParams = hasFilter ? { filter: effectiveFilter } : {};
              const dataFetcher = () => hasFilter ? Opportunity.filter(effectiveFilter) : Opportunity.list();
              const oppsFull = await cachedRequest("Opportunity", methodName, methodParams, dataFetcher);
              if (mounted) {
                setPipelineData(computeFromOpps(oppsFull));
              }
            } catch { /* ignore background errors */ }
          })();
          return; // Exit if preloaded data is used
        }

        const tenantFilter = props?.tenantFilter || {};
        
        // Guard: Don't fetch if no tenant_id is present
        if (!tenantFilter.tenant_id) {
          if (mounted) {
            setPipelineData([]);
            setLoading(false);
          }
          return;
        }
        
        const showTestData = props?.showTestData; // Access showTestData from props

        // Re-introduce the effectiveFilter logic from original code, now using props.showTestData
        const effectiveFilter = showTestData
          ? { ...tenantFilter }
          : { ...tenantFilter, is_test_data: false };
        
        // Determine if we need to call filter or list based on effectiveFilter
        const hasFilter = Object.keys(effectiveFilter).length > 0;

        // Use pre-computed pipeline counts (90%+ faster) if no special filtering
        if (!hasFilter || (Object.keys(effectiveFilter).length === 1 && effectiveFilter.tenant_id)) {
          try {
            const dashboardData = await getDashboardFunnelCounts({ 
              tenant_id: tenantFilter?.tenant_id,
              include_test_data: showTestData,
              bust_cache: props?.bustCache || false // Allow parent to force cache refresh
            });
            
            console.log('[SalesPipeline] Dashboard funnel data:', {
              tenantId: tenantFilter?.tenant_id,
              includeTestData: showTestData,
              pipelineData: dashboardData?.pipeline,
              sampleStage: dashboardData?.pipeline?.[0]
            });
            
            if (mounted && dashboardData?.pipeline) {
              // Map pre-computed pipeline data to chart format
              const suffix = showTestData ? 'total' : 'real';
              const stages = {
                prospecting: { name: "Prospecting", value: dashboardData.pipeline.find(s => s.stage === 'prospecting')?.[`value_${suffix}`] || 0, count: dashboardData.pipeline.find(s => s.stage === 'prospecting')?.[`count_${suffix}`] || 0, key: 'prospecting' },
                qualification: { name: "Qualification", value: dashboardData.pipeline.find(s => s.stage === 'qualification')?.[`value_${suffix}`] || 0, count: dashboardData.pipeline.find(s => s.stage === 'qualification')?.[`count_${suffix}`] || 0, key: 'qualification' },
                proposal: { name: "Proposal", value: dashboardData.pipeline.find(s => s.stage === 'proposal')?.[`value_${suffix}`] || 0, count: dashboardData.pipeline.find(s => s.stage === 'proposal')?.[`count_${suffix}`] || 0, key: 'proposal' },
                negotiation: { name: "Negotiation", value: dashboardData.pipeline.find(s => s.stage === 'negotiation')?.[`value_${suffix}`] || 0, count: dashboardData.pipeline.find(s => s.stage === 'negotiation')?.[`count_${suffix}`] || 0, key: 'negotiation' },
                closed_won: { name: "Closed Won", value: dashboardData.pipeline.find(s => s.stage === 'closed_won')?.[`value_${suffix}`] || 0, count: dashboardData.pipeline.find(s => s.stage === 'closed_won')?.[`count_${suffix}`] || 0, key: 'closed_won' },
                closed_lost: { name: "Closed Lost", value: dashboardData.pipeline.find(s => s.stage === 'closed_lost')?.[`value_${suffix}`] || 0, count: dashboardData.pipeline.find(s => s.stage === 'closed_lost')?.[`count_${suffix}`] || 0, key: 'closed_lost' },
              };

              // Filter to only visible stages based on preferences
              const processedData = Object.entries(stages)
                .filter(([key]) => visibleStageKeys.has(key))
                .map(([, stage]) => ({
                  stage: stage.name,
                  value: stage.value,
                  count: stage.count,
                }));

              // If all values are zero but there are counts, fall back to using counts
              const allValuesZero = processedData.every((s) => s.value === 0);
              if (allValuesZero && processedData.some((s) => s.count > 0)) {
                setPipelineData(processedData.map((s) => ({ stage: s.stage, value: s.count, isCount: true })));
              } else {
                setPipelineData(processedData);
              }
              setLoading(false);
              return; // Exit early - we got the data
            }
          } catch (error) {
            console.warn('[SalesPipeline] Fast path failed, falling back to full fetch:', error);
            // Fall through to slow path below
          }
        }

        // Fallback: Use slow path for complex filters
        const methodName = hasFilter ? "filter" : "list";
        const methodParams = hasFilter ? { filter: effectiveFilter } : {};
        const dataFetcher = () => hasFilter ? Opportunity.filter(effectiveFilter) : Opportunity.list();

        // Use shared cache/queue to avoid 429s
        const opps = await cachedRequest(
          "Opportunity",
          methodName,
          methodParams,
          dataFetcher
        );

        if (mounted) { // Only update state if component is still mounted
          setPipelineData(computeFromOpps(opps)); // Use the new helper function
          setLoading(false); // End loading
          loadingRef.current = false;
        }
      } catch (error) {
        if (mounted) { // Only set error if component is still mounted
          console.warn("SalesPipeline: failed to load via cachedRequest:", error); // Use console.warn as in outline
          setErrorMessage("Failed to load pipeline data"); // Keep user-friendly error message
          setLoading(false); // End loading even on error
          loadingRef.current = false;
        }
      }
    };

    load(); // Execute the async load function
    return () => { 
      mounted = false;
      loadingRef.current = false;
    }; // Cleanup function for unmounting
     
  }, [props?.tenantFilter?.tenant_id, props?.tenantFilter, props?.showTestData, props?.bustCache, props?.prefetchedOpportunities, props?.refreshKey, cachedRequest, userLoading, authCookiesReady, visibleOpportunityCards]); // Include refreshKey to trigger reload on refresh

  return (
    <Card className="bg-slate-800 border-slate-700 h-full flex flex-col">
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          Sales Pipeline
        </CardTitle>
        <p className="text-slate-400 text-sm">Opportunities by stage</p>
      </CardHeader>
      <CardContent className="p-6 flex-1 flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-400">Loading pipeline data...</span>
          </div>
        ) : errorMessage ? (
          <div className="h-64 flex flex-col items-center justify-center text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-4">
            <AlertTriangle className="w-12 h-12 mb-4" />
            <p className="font-medium">Failed to load sales pipeline.</p>
            <p className="text-sm text-center">{errorMessage}</p>
          </div>
        ) : pipelineData.every(stage => stage.value === 0) ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-700/20 border border-slate-600 rounded-lg p-4">
            <Target className="w-12 h-12 text-slate-500 mb-4" />
            <p className="font-medium">No opportunity data to display.</p>
            <p className="text-sm">Create some opportunities to see the pipeline.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis 
                    dataKey="stage" 
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    stroke="#475569"
                  />
                  <YAxis 
                    tickCount={9}
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    stroke="#475569"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      color: '#f1f5f9'
                    }}
                    formatter={(value, _name, props) => {
                      // If we fell back to counts (isCount flag), show count formatting
                      if (props?.payload?.isCount) return [`${value}`, 'Opportunities'];
                      return [`$${value.toLocaleString()}`, 'Pipeline Value'];
                    }}
                    labelFormatter={(label) => `Stage: ${label}`}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="value"
                      position="top"
                      style={{ fill: '#94a3b8', fontSize: '12px' }}
                      formatter={(value, _name, props) => {
                        if (props?.payload?.isCount) return `${value}`;
                        return `$${value.toLocaleString()}`;
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
            
            <div className="text-center border-t border-slate-700">
              <Button variant="outline" size="sm" asChild className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                <Link to={createPageUrl("Opportunities")}>
                  View All {opportunitiesLabel}
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default React.memo(SalesPipeline);
