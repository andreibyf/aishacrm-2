import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  Building,
  DollarSign,
  Star,
  Target,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Account, Lead, Opportunity } from "@/api/entities";
import TrendIndicator from "./TrendIndicator";
import { getBackendUrl } from "@/api/backendUrl";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const BACKEND_URL = getBackendUrl();

export default function OverviewStats({ tenantFilter }) {
  const [stats, setStats] = useState({
    contacts: 0,
    accounts: 0,
    leads: 0,
    opportunities: 0,
    activities: 0,
    pipelineValue: 0,
  });

  const [trends, setTrends] = useState({
    contacts: null,
    accounts: null,
    leads: null,
    opportunities: null,
    activities: null,
    pipelineValue: null,
  });

  const [chartData, setChartData] = useState({
    leadSources: [],
    opportunityStages: [],
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Clear any previous errors
        setError(null);
        
        console.log("OverviewStats: Fetching stats with filter:", tenantFilter);

        // Ensure test data is excluded unless explicitly included for direct entity fetches
        const effectiveFilter = { ...tenantFilter };
        if (!("is_test_data" in effectiveFilter)) {
          effectiveFilter.is_test_data = false;
        }

        // Build query params for backend API call
        const queryParams = new URLSearchParams();
        if (effectiveFilter.tenant_id) {
          queryParams.append('tenant_id', effectiveFilter.tenant_id);
        }

        // Call backend API endpoint for dashboard stats
        const response = await fetch(`${BACKEND_URL}/api/reports/dashboard-stats?${queryParams.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        // Fetch additional data for charts and specific stats that backend might not provide
        const [leadsResult, opportunitiesResult, accountsResult] = await Promise.all([
          Lead.filter(effectiveFilter),
          Opportunity.filter(effectiveFilter),
          Account.filter(effectiveFilter),
        ]);

        // DEFENSIVE UNWRAPPING - handle both array and wrapped responses
        const unwrap = (result) => {
          // Already an array - return as-is
          if (Array.isArray(result)) return result;
          
          // Wrapped in { data: [...] } shape
          if (result?.data && Array.isArray(result.data)) return result.data;
          
          // Wrapped in { status: "success", data: [...] } shape
          if (result?.status === 'success' && Array.isArray(result.data)) return result.data;
          
          // Invalid response - log warning and return empty array
          console.warn("OverviewStats: API response not in expected format:", result);
          return [];
        };

        const allLeads = unwrap(leadsResult);
        const allOpportunities = unwrap(opportunitiesResult);
        const allAccounts = unwrap(accountsResult);

        if (result.status === 'success' && result.data) {
          const dashboardStats = result.data;

          console.log(
            "OverviewStats: Received dashboard stats from backend:",
            dashboardStats,
          );
          console.log(
            "OverviewStats: Chart data counts from direct entity fetches:",
            {
              leads: allLeads.length,
              opportunities: allOpportunities.length,
              accounts: allAccounts.length,
            },
          );

          // Calculate pipeline value from opportunities
          const pipelineValue = allOpportunities.reduce((sum, opp) => {
            const value = parseFloat(opp.amount) || 0;
            return sum + value;
          }, 0);

          setStats({
            contacts: dashboardStats.totalContacts || 0,
            accounts: allAccounts.length, // Use actual count from direct fetch for accuracy
            leads: allLeads.length, // Use actual total leads from direct fetch
            opportunities: allOpportunities.length, // Use actual total opportunities from direct fetch
            activities: dashboardStats.totalActivities || 0, // Use total activities from backend
            pipelineValue: pipelineValue, // Calculate from actual opportunity values
          });

          // Set trends if available
          if (dashboardStats.trends) {
            setTrends(dashboardStats.trends);
          }
        } else {
          console.warn(
            "OverviewStats: No stats data received from backend API.",
          );
        }

        // Prepare chart data
        // Initialize all possible lead sources
        const allLeadSources = {
          "website": 0,
          "referral": 0,
          "cold_call": 0,
          "email": 0,
          "social_media": 0,
          "trade_show": 0,
          "advertising": 0,
          "other": 0,
        };

        allLeads.forEach((lead) => {
          const source = (lead.source || "").toLowerCase();
          const key =
            Object.prototype.hasOwnProperty.call(allLeadSources, source)
              ? source
              : "other";
          allLeadSources[key]++;
        });

        // Initialize all possible opportunity stages
        const allOpportunityStages = {
          "prospecting": 0,
          "qualification": 0,
          "proposal": 0,
          "negotiation": 0,
          "closed_won": 0,
          "closed_lost": 0,
        };

        allOpportunities.forEach((opp) => {
          const stage = (opp.stage || "").toLowerCase();
          const key =
            Object.prototype.hasOwnProperty.call(allOpportunityStages, stage)
              ? stage
              : "prospecting";
          allOpportunityStages[key]++;
        });

        setChartData({
          leadSources: Object.entries(allLeadSources).map(([name, value]) => ({
            name: name.replace(/_/g, " ").replace(
              /\b\w/g,
              (l) => l.toUpperCase(),
            ),
            value,
            originalKey: name,
          })),
          opportunityStages: Object.entries(allOpportunityStages).map((
            [name, value],
          ) => ({
            name: name.replace(/_/g, " ").replace(
              /\b\w/g,
              (l) => l.toUpperCase(),
            ),
            value,
            originalKey: name,
          })),
        });
      } catch (error) {
        console.error("Error fetching overview stats:", error);
        setError(error.message || "Failed to load overview stats. Please try again later.");
        
        // Set default empty state on error
        setStats({
          contacts: 0,
          accounts: 0,
          leads: 0,
          opportunities: 0,
          activities: 0,
          pipelineValue: 0,
        });
        setChartData({
          leadSources: [],
          opportunityStages: [],
        });
      }
    };

    fetchStats();
  }, [tenantFilter]);

  const statItems = [
    {
      title: "Total Contacts",
      value: stats.contacts,
      icon: Users,
      color: "bg-blue-500",
      trend: trends.contacts,
    },
    {
      title: "Active Accounts",
      value: stats.accounts,
      icon: Building,
      color: "bg-emerald-500",
      trend: trends.accounts,
    },
    {
      title: "Total Leads",
      value: stats.leads,
      icon: Star,
      color: "bg-purple-500",
      trend: trends.leads,
    },
    {
      title: "Opportunities",
      value: stats.opportunities,
      icon: Target,
      color: "bg-orange-500",
      trend: trends.opportunities,
    },
    {
      title: "Pipeline Value",
      value: `$${stats.pipelineValue.toLocaleString()}`,
      icon: DollarSign,
      color: "bg-amber-500",
      trend: trends.pipelineValue,
    },
    {
      title: "Activities This Month",
      value: stats.activities,
      icon: Activity,
      color: "bg-indigo-500",
      trend: trends.activities,
    },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <Card className="bg-red-900/20 border-red-700">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="text-red-400">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-red-300 font-medium mb-1">
                  Failed to load overview stats
                </h3>
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statItems.map((stat, index) => (
          <Card
            key={index}
            className="relative overflow-hidden bg-slate-800 border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <div
              className={`absolute top-0 right-0 w-32 h-32 ${stat.color} opacity-5 rounded-full transform translate-x-8 -translate-y-8`}
            />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.color} bg-opacity-10`}>
                <stat.icon
                  className={`w-4 h-4 ${stat.color.replace("bg-", "text-")}`}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-100 mb-1">
                {stat.value}
              </div>
              <TrendIndicator percentage={stat.trend} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">
              Lead Sources Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.leadSources.filter((item) => item.value > 0)} // Only show slices with data
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => {
                    // Only show labels for slices that are 5% or larger to avoid overlap
                    if (percent >= 0.05) {
                      return `${name} ${(percent * 100).toFixed(0)}%`;
                    }
                    return "";
                  }}
                >
                  {chartData.leadSources.filter((item) => item.value > 0).map((
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
                  align="center"
                  verticalAlign="bottom"
                  layout="horizontal"
                  iconType="circle"
                  wrapperStyle={{
                    paddingTop: "15px",
                    fontSize: "12px",
                  }}
                  payload={chartData.leadSources.map((item) => {
                    const filteredItems = chartData.leadSources.filter((d) =>
                      d.value > 0
                    );
                    const itemInFiltered = filteredItems.find((fItem) =>
                      Object.prototype.hasOwnProperty.call(
                        fItem,
                        "originalKey",
                      ) && fItem.originalKey === item.originalKey
                    );
                    const color = item.value > 0
                      ? COLORS[
                        filteredItems.indexOf(itemInFiltered) % COLORS.length
                      ]
                      : "#64748b"; // Grey out items with 0 value
                    return {
                      value: item.name,
                      type: "circle",
                      color: color,
                      payload: item, // Keep the original item data in payload
                    };
                  })}
                  formatter={(value, entry) => {
                    const item = entry.payload;
                    const totalWithData = chartData.leadSources.reduce(
                      (sum, item) => sum + (item.value > 0 ? item.value : 0),
                      0,
                    );
                    const percent = totalWithData > 0 && item.value > 0
                      ? ((item.value / totalWithData) * 100).toFixed(0)
                      : 0;
                    return (
                      <span
                        style={{
                          color: entry.color, // match slice color; grey for zero
                          fontStyle: item.value === 0 ? "italic" : "normal",
                        }}
                      >
                        {value} ({item.value > 0 ? `${percent}%` : "0"})
                      </span>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">
              Sales Pipeline by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData.opportunityStages.filter((item) =>
                  item.value > 0
                )}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
