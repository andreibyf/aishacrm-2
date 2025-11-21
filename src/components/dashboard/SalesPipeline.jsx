
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, AlertTriangle, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { useApiManager } from "@/components/shared/ApiManager";
import { Opportunity } from "@/api/entities";
import { useUser } from "@/components/shared/useUser";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { Link } from "react-router-dom"; // Added import
import { createPageUrl } from "@/utils"; // Added import
import { Button } from "@/components/ui/button"; // Added import for Button component

export default function SalesPipeline(props) {
  const [pipelineData, setPipelineData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const { cachedRequest } = useApiManager();
  const { user, loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();

  React.useEffect(() => {
        // Wait for user to be loaded before fetching data
        if (userLoading || !authCookiesReady) {
          return;
        }

    let mounted = true; // Flag to prevent state updates on unmounted component

    // Helper function to compute pipeline data from a list of opportunities
    const computeFromOpps = (opps) => {
      // Canonical stage buckets (include legacy mappings for won/lost)
      const stages = {
        prospecting: { name: "Prospecting", count: 0, value: 0 },
        qualification: { name: "Qualification", count: 0, value: 0 },
        proposal: { name: "Proposal", count: 0, value: 0 },
        negotiation: { name: "Negotiation", count: 0, value: 0 },
        closed_won: { name: "Closed Won", count: 0, value: 0 },
        closed_lost: { name: "Closed Lost", count: 0, value: 0 },
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
        }
      });

      const processedData = Object.values(stages).map((stage) => ({
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
      setLoading(true); // Start loading
      setErrorMessage(null); // Clear any previous errors

      try {
        // If preloaded (scoped) opportunities provided, use them directly
        if (Array.isArray(props?.prefetchedOpportunities)) {
          if (mounted) {
            setPipelineData(computeFromOpps(props.prefetchedOpportunities));
            setLoading(false);
          }
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
        }
      } catch (error) {
        if (mounted) { // Only set error if component is still mounted
          console.warn("SalesPipeline: failed to load via cachedRequest:", error); // Use console.warn as in outline
          setErrorMessage("Failed to load pipeline data"); // Keep user-friendly error message
          setLoading(false); // End loading even on error
        }
      }
    };

    load(); // Execute the async load function
    return () => { mounted = false; }; // Cleanup function for unmounting
     
  }, [props?.tenantFilter, props?.showTestData, props?.prefetchedOpportunities, cachedRequest, userLoading, authCookiesReady]); // Include all relevant props and cachedRequest in dependencies

  return (
    <Card className="bg-slate-800 border-slate-700 h-full">
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          Sales Pipeline
        </CardTitle>
        <p className="text-slate-400 text-sm">Opportunities by stage</p>
      </CardHeader>
      <CardContent className="p-6">
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
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis 
                    dataKey="stage" 
                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                    stroke="#475569"
                  />
                  <YAxis 
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
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
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
            
            <div className="text-center pt-4 border-t border-slate-700 mt-4">
              <Button variant="outline" size="sm" asChild className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                <Link to={createPageUrl("Opportunities")}>
                  View All Opportunities
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
