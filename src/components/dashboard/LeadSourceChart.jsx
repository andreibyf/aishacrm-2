import React, { useEffect, useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Lead } from "@/api/entities"; // ensure correct SDK import
import { useUser } from "@/components/shared/useUser";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { Loader2, PieChart as PieChartIcon, TrendingUp } from "lucide-react";
import { useApiManager } from "@/components/shared/ApiManager"; // Updated import path for useApiManager
import { useEntityLabel } from "@/components/shared/entityLabelsHooks";

// Define colors for the chart slices
const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#ff4d4d",
];

function LeadSourceChart(props) { // Changed to receive `props`
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { cachedRequest } = useApiManager();
  const { singular: leadLabel, plural: leadsLabel } = useEntityLabel('leads');
  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();

  // Helper: compute chart data from a leads array
  const computeFromLeads = (leadsArr) => {
    const allSources = {
      website: 0,
      referral: 0,
      cold_call: 0,
      email: 0,
      social_media: 0,
      trade_show: 0,
      advertising: 0,
      other: 0,
    };
    (Array.isArray(leadsArr) ? leadsArr : []).forEach((lead) => {
      const source = lead?.source || "other";
      if (Object.prototype.hasOwnProperty.call(allSources, source)) {
        allSources[source]++;
      } else {
        allSources.other++;
      }
    });
    const formattedData = Object.entries(allSources).map(([key, value]) => ({
      name: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      value,
      originalKey: key,
    }));
    setData(formattedData);
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      try {
        // Guard: wait for user + auth cookies
        if (userLoading || !authCookiesReady) {
          if (mounted) setLoading(true);
          return;
        }
        const tenantFilter = props?.tenantFilter || {};
        const showTestData = props?.showTestData;

        // Guard: If no tenant_id in filter, don't fetch (superadmin needs to select tenant)
        if (!tenantFilter.tenant_id) {
          if (mounted) {
            setData([]);
            setLoading(false);
          }
          return;
        }

        const effectiveFilter = showTestData
          ? { ...tenantFilter }
          : Object.assign({}, tenantFilter, { is_test_data: false });

        /**
         * PERFORMANCE OPTIMIZATION (v3.6.18+)
         * 
         * FAST PATH: Use pre-aggregated leadsBySource from dashboard bundle
         * - Provided in: stats.leadsBySource from /api/reports/dashboard-bundle
         * - Format: { 'website': 9, 'referral': 3, 'other': 18, ... }
         * - Performance: Instant (no additional API call needed)
         * - Benefits: Reduces dashboard load time by ~200ms per widget
         * 
         * FALLBACK: If not available, fetch all leads and aggregate client-side
         * - Used when: Viewing widget outside dashboard context
         * - Performance: ~300ms for 100+ leads
         */
        if (mounted && props?.stats?.leadsBySource && typeof props.stats.leadsBySource === 'object') {
          const aggregated = props.stats.leadsBySource;
          const formattedData = Object.entries(aggregated).map(([key, value]) => ({
            name: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
            value,
            originalKey: key,
          }));
          setData(formattedData);
          setLoading(false);
          return; // Skip fetching - we have pre-aggregated data!
        }

        // If prefetched leads are provided (from dashboard bundle), use them
        // `props.leadsData.length >= 0` is used to ensure it's an array and not null/undefined
        if (
          mounted && Array.isArray(props?.leadsData) &&
          props.leadsData.length >= 0
        ) {
          // Filter the provided leads by effectiveFilter (tenant/test-data)
          const filtered = props.leadsData.filter((l) => {
            const tenantOk = !effectiveFilter.tenant_id ||
              l.tenant_id === effectiveFilter.tenant_id;
            // Test data filtering: if effectiveFilter has { is_test_data: { $ne: true } },
            // then we exclude leads where l.is_test_data is true.
            // If effectiveFilter doesn't have it (showTestData is true), this condition is always true.
            const testOk =
              !(effectiveFilter.is_test_data &&
                effectiveFilter.is_test_data.$ne === true &&
                l.is_test_data === true);
            return tenantOk && testOk;
          });
          computeFromLeads(filtered);
          setLoading(false); // Crucial to set loading to false when using prefetched data
          // Background refresh to hydrate with full dataset
          (async () => {
            try {
              const fullLeads = await cachedRequest(
                "Lead",
                "filter",
                { filter: effectiveFilter },
                () => Lead.filter(effectiveFilter),
              );
              if (mounted) computeFromLeads(fullLeads);
            } catch { /* ignore background errors */ }
          })();
          return; // Exit early as we've processed prefetched data
        }

        // Otherwise, fetch via API (cached)
        const leads = await cachedRequest(
          "Lead",
          "filter",
          { filter: effectiveFilter },
          () => Lead.filter(effectiveFilter),
        );

        if (mounted) {
          computeFromLeads(leads);
        }
      } catch (error) {
        console.error(
          "LeadSourceChart: Failed to fetch or compute lead sources:",
          error,
        );
        if (mounted) setData([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
    // Depend on filter, test toggle, cachedRequest, and leadsData from parent
  }, [props.tenantFilter, props.showTestData, props.leadsData, props.stats?.leadsBySource, cachedRequest, userLoading, authCookiesReady]);

  return (
    <Card className="bg-slate-800 border-slate-700 h-full">
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          {leadLabel} Sources
        </CardTitle>
        <p className="text-slate-400 text-sm">Where your {leadsLabel.toLowerCase()} come from</p>
      </CardHeader>
      <CardContent className="p-6">
        {loading
          ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <span className="ml-3 text-slate-400">
                Loading source data...
              </span>
            </div>
          )
          : (
            data.every((item) => item.value === 0)
              ? ( // Check if all values are zero
                <div className="text-center py-8 text-slate-500 h-[300px] flex flex-col justify-center items-center">
                  <PieChartIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="text-slate-400">No {leadLabel.toLowerCase()} data available</p>
                  <p className="text-sm text-slate-500">
                    {leadLabel} sources will appear here
                  </p>
                </div>
              )
              : (
                // Reserve extra height so the legend is always visible
                <div className="h-[28rem] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart
                      margin={{ top: 20, right: 20, bottom: 60, left: 20 }}
                    >
                      <Pie
                        data={data.filter((item) => item.value > 0)} // Only show slices with data in the pie
                        cx="50%"
                        cy="45%"
                        labelLine={false}
                        label={({ name, percent }) => {
                          // Only show labels for slices that are 5% or larger to avoid overlap
                          if (percent >= 0.05) {
                            return `${name} ${(percent * 100).toFixed(0)}%`;
                          }
                          return "";
                        }}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                        isAnimationActive={false}
                      >
                        {data.filter((item) => item.value > 0).map((
                          entry,
                          index,
                        ) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #475569",
                          borderRadius: "8px",
                          color: "#f1f5f9",
                        }}
                      />
                      <Legend
                        height={36} /* reserve space for legend */
                        align="center"
                        verticalAlign="bottom"
                        layout="horizontal"
                        iconType="circle"
                        wrapperStyle={{
                          paddingTop: "6px",
                          fontSize: "12px",
                        }}
                        // Explicitly define payload to include all categories, even those with 0 value
                        payload={data.map((item) => {
                          // Find the actual index for coloring for items with value > 0
                          const visibleItems = data.filter((d) => d.value > 0);
                          const itemInVisibleIndex = visibleItems.findIndex(
                            (d) => d.name === item.name
                          );

                          return {
                            value: item.name,
                            type: "circle",
                            color: item.value > 0
                              ? COLORS[itemInVisibleIndex % COLORS.length]
                              : "#64748b", // Grey for zero values
                            payload: item,
                          };
                        })}
                        formatter={(value, entry) => {
                          const item = entry.payload; // The full data item from our custom payload
                          const totalWithData = data.reduce(
                            (sum, currentItem) =>
                              sum +
                              (currentItem.value > 0 ? currentItem.value : 0),
                            0,
                          );
                          const percent = totalWithData > 0 && item.value > 0
                            ? ((item.value / totalWithData) * 100).toFixed(0)
                            : 0;
                          return (
                            <span
                              style={{
                                color: entry.color, // match the slice color; grey when 0
                                fontStyle: item.value === 0
                                  ? "italic"
                                  : "normal",
                              }}
                            >
                              {value} ({item.value > 0 ? `${percent}%` : "0"})
                            </span>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )
          )}
      </CardContent>
    </Card>
  );
}

export default memo(LeadSourceChart);
