import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Users, Zap } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend, // Added Legend as per outline
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays } from "date-fns"; // Changed from subMonths/startOfMonth
import { Lead } from "@/api/entities";

// Updated COLORS as per outline + added a few more for variety
const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#A28FDF",
  "#FF6347",
];

export default function LeadAnalytics({ tenantFilter }) {
  // State for fetched and processed data
  const [, setAllLeads] = useState([]);
  const [leadsByStatus, setLeadsByStatus] = useState([]);
  const [leadsBySource, setLeadsBySource] = useState([]);
  const [leadsOverTime, setLeadsOverTime] = useState([]);
  const [leadQualityData, setLeadQualityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Key metrics states, derived from allLeads
  const [totalLeadsCount, setTotalLeadsCount] = useState(0);
  const [convertedLeadsCount, setConvertedLeadsCount] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);
  const [avgLeadScore, setAvgLeadScore] = useState(0);

  useEffect(() => {
    const fetchLeadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Guard: require a tenant_id to avoid cross-tenant loads for admins/superadmins
        if (!tenantFilter || (tenantFilter && !tenantFilter.tenant_id)) {
          setAllLeads([]);
          setLeadsByStatus([]);
          setLeadsBySource([]);
          setLeadsOverTime([]);
          setLeadQualityData([]);
          setTotalLeadsCount(0);
          setConvertedLeadsCount(0);
          setConversionRate(0);
          setAvgLeadScore(0);
          return;
        }

        // Ensure test data is excluded unless explicitly allowed
        const effectiveFilter = { ...tenantFilter };
        if (!("is_test_data" in effectiveFilter)) {
          effectiveFilter.is_test_data = false;
        }

        // Fetch leads from real API/entity layer
        const resp = await Lead.filter(effectiveFilter).catch(() => []);
        // Handle both array responses and wrapped responses for backward compatibility
        const fetchedLeads = Array.isArray(resp) ? resp : (resp?.data?.leads || resp?.leads || []);
        setAllLeads(fetchedLeads); // Store raw leads if needed elsewhere, otherwise just process

      // --- Calculate Key Metrics ---
      const total = fetchedLeads.length;
      const converted = fetchedLeads.filter((lead) =>
        lead.status === "converted"
      ).length;
      const rate = total > 0 ? (converted / total) * 100 : 0;
      const avgScore = total > 0
        ? fetchedLeads.reduce((sum, lead) => sum + (lead.score || 0), 0) / total
        : 0;

      setTotalLeadsCount(total);
      setConvertedLeadsCount(converted);
      setConversionRate(rate);
      setAvgLeadScore(Math.round(avgScore));

      // --- Leads by Status Distribution ---
      const statusMap = fetchedLeads.reduce((acc, lead) => {
        const status = lead.status || "new";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const statusData = Object.entries(statusMap).map(([name, value]) => ({
        name,
        value,
      }));
      setLeadsByStatus(statusData);

      // --- Lead Source Performance ---
      const sourceMap = {};
      fetchedLeads.forEach((lead) => {
        const source = lead.source || "other";
        if (!sourceMap[source]) {
          sourceMap[source] = { total: 0, converted: 0, value: 0 };
        }
        sourceMap[source].total++;
        if (lead.status === "converted") {
          sourceMap[source].converted++;
          sourceMap[source].value += lead.estimated_value || 0;
        }
      });
      const sourceData = Object.entries(sourceMap).map(([name, data]) => ({
        source: name,
        leads: data.total,
        converted: data.converted,
        conversionRate: data.total > 0
          ? Math.round((data.converted / data.total) * 100)
          : 0,
        value: Math.round(data.value / 1000),
      }));
      setLeadsBySource(sourceData);

      // --- Daily Lead Generation Trend (Last 30 days) ---
      const dailyData = [];
      const today = new Date();
      // Loop from 29 days ago up to today (0 days ago)
      for (let i = 29; i >= 0; i--) {
        const date = subDays(today, i);
        const formattedDate = format(date, "MMM dd"); // e.g., 'Jul 28'

        const dayLeads = fetchedLeads.filter((lead) => {
          const leadDate = new Date(lead.created_date);
          return format(leadDate, "MMM dd") === formattedDate; // Compare by formatted date string
        });

        const convertedInDay =
          dayLeads.filter((lead) => lead.status === "converted").length;

        dailyData.push({
          date: formattedDate,
          leads: dayLeads.length,
          converted: convertedInDay,
          rate: dayLeads.length > 0
            ? Math.round((convertedInDay / dayLeads.length) * 100)
            : 0,
        });
      }
      setLeadsOverTime(dailyData);

      // --- Lead Quality Distribution ---
      const qualityRanges = {
        "Low (0-30)": 0,
        "Medium (31-60)": 0,
        "High (61-80)": 0,
        "Premium (81-100)": 0,
      };
      fetchedLeads.forEach((lead) => {
        const score = lead.score || 0;
        if (score <= 30) qualityRanges["Low (0-30)"]++;
        else if (score <= 60) qualityRanges["Medium (31-60)"]++;
        else if (score <= 80) qualityRanges["High (61-80)"]++;
        else qualityRanges["Premium (81-100)"]++;
      });
      const qualityData = Object.entries(qualityRanges).map((
        [range, count],
      ) => ({ range, count }));
      setLeadQualityData(qualityData);
      } catch (e) {
        console.error("LeadAnalytics: failed to load leads", e);
        setError(e?.message || String(e));
        setAllLeads([]);
        setLeadsByStatus([]);
        setLeadsBySource([]);
        setLeadsOverTime([]);
        setLeadQualityData([]);
        setTotalLeadsCount(0);
        setConvertedLeadsCount(0);
        setConversionRate(0);
        setAvgLeadScore(0);
      } finally {
        setLoading(false);
      }
    };

    fetchLeadData();
  }, [tenantFilter]); // Re-run effect when tenantFilter changes

  // Helper function to render Custom Tooltip for Pie Chart
  const renderCustomizedTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          className="p-2 bg-slate-800 border border-slate-700 rounded-lg shadow-md"
          style={{
            backgroundColor: "#1e293b",
            border: "1px solid #475569",
            borderRadius: "8px",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          }}
        >
          <p className="text-sm font-semibold text-slate-100">{data.name}</p>
          <p className="text-xs text-slate-400">Count: {data.value}</p>
          <p className="text-xs text-slate-400">
            Percentage: {(data.percent * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {loading && (
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6 text-center text-slate-400">
            Loading lead analytics...
          </CardContent>
        </Card>
      )}
      {error && !loading && (
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6 text-center text-red-400">
            {error}
          </CardContent>
        </Card>
      )}
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Total Leads
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  {totalLeadsCount}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Conversion Rate
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  {conversionRate.toFixed(1)}%
                </p>
              </div>
              <Target className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Converted Leads
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  {convertedLeadsCount}
                </p>
              </div>
              <Zap className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Avg Lead Score
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  {avgLeadScore}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">
              Lead Generation Trend (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={leadsOverTime}
                margin={{ top: 5, right: 30, left: 20, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval="preserveStartEnd"
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
                <Legend
                  wrapperStyle={{ paddingTop: "20px", color: "#f1f5f9" }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Total Leads"
                />
                <Line
                  type="monotone"
                  dataKey="converted"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Converted"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">
              Lead Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={leadsByStatus}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {leadsByStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={renderCustomizedTooltip}
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: "20px", color: "#f1f5f9" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">
              Lead Quality Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={leadQualityData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">
              Lead Source Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {leadsBySource.map((source) => (
                <div
                  key={source.source}
                  className="flex items-center justify-between p-3 bg-slate-700 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-200 capitalize">
                      {source.source}
                    </p>
                    <p className="text-sm text-slate-400">
                      {source.leads} leads • {source.converted}{" "}
                      converted • ${source.value}K value
                    </p>
                  </div>
                  <Badge
                    variant={source.conversionRate > 30
                      ? "default"
                      : source.conversionRate > 15
                      ? "secondary"
                      : "outline"}
                    className="ml-4 bg-slate-600 text-slate-200 border-slate-500"
                  >
                    {source.conversionRate}% rate
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
