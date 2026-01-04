import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Award, Calendar, DollarSign, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { differenceInDays, format, startOfMonth, subMonths } from "date-fns";
import { Opportunity } from "@/api/entities";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

// Changed component props to accept tenantFilter instead of direct opportunities/accounts
export default function SalesAnalytics({ tenantFilter }) {
  const [period, setPeriod] = useState("6months");
  // State to hold the fetched opportunities
  const [opportunities, setOpportunities] = useState([]);
  // States to hold the processed data for charts
  const [revenueByStage, setRevenueByStage] = useState([]);
  const [dealsOverTime, setDealsOverTime] = useState([]);
  const [leadSourcePerformance, setLeadSourcePerformance] = useState([]);

  // useEffect to fetch and process data when tenantFilter or period changes
  useEffect(() => {
    const fetchAndProcessSalesData = async () => {
      // Assuming Opportunity.filter is an async function that fetches opportunities
      // based on the provided tenantFilter (e.g., tenantId, or 'all' for superadmin)
      const resp = await Opportunity.filter(tenantFilter);
      // Handle both array responses and wrapped responses for backward compatibility
      const fetchedOpportunities = Array.isArray(resp) ? resp : (resp?.data?.opportunities || resp?.opportunities || []);
      setOpportunities(fetchedOpportunities); // Store the raw fetched opportunities

      // Process the fetched data for various analytics charts
      const monthlyData = getMonthlySalesData(fetchedOpportunities, period);
      setDealsOverTime(monthlyData);

      const stageDistData = getStageDistribution(fetchedOpportunities);
      setRevenueByStage(stageDistData);

      const leadSourceData = getLeadSourcePerformance(fetchedOpportunities);
      setLeadSourcePerformance(leadSourceData);
    };

    fetchAndProcessSalesData();
  }, [tenantFilter, period]); // Dependencies: re-run when tenantFilter or period changes

  // Monthly sales performance function - now accepts opportunities and period as arguments
  const getMonthlySalesData = (opportunitiesToProcess, currentPeriod) => {
    const months = currentPeriod === "12months" ? 12 : 6;
    const monthlyData = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i));
      const monthEnd = startOfMonth(subMonths(new Date(), i - 1)); // Correctly represents the start of the next month
      const monthName = format(monthStart, "MMM yyyy");

      const monthOpps = opportunitiesToProcess.filter((opp) => {
        // Ensure close_date exists and is a valid date string
        if (!opp.close_date) return false;
        const closeDate = new Date(opp.close_date);
        return closeDate >= monthStart && closeDate < monthEnd &&
          opp.stage === "closed_won";
      });

      const monthlyRevenue = monthOpps.reduce(
        (sum, opp) => sum + (opp.amount || 0),
        0,
      );

      monthlyData.push({
        month: monthName,
        revenue: Math.round(monthlyRevenue / 1000), // Convert to thousands
        deals: monthOpps.length,
        avgDeal: monthOpps.length > 0
          ? Math.round(monthlyRevenue / monthOpps.length / 1000)
          : 0,
      });
    }
    return monthlyData;
  };

  // Stage distribution function - now accepts opportunities as an argument
  const getStageDistribution = (opportunitiesToProcess) => {
    const stages = {
      prospecting: { name: "Prospecting", count: 0, value: 0 },
      qualification: { name: "Qualification", count: 0, value: 0 },
      proposal: { name: "Proposal", count: 0, value: 0 },
      negotiation: { name: "Negotiation", count: 0, value: 0 },
      closed_won: { name: "Closed Won", count: 0, value: 0 },
      closed_lost: { name: "Closed Lost", count: 0, value: 0 },
    };

    opportunitiesToProcess.forEach((opp) => {
      if (stages[opp.stage]) {
        stages[opp.stage].count++;
        stages[opp.stage].value += opp.amount || 0;
      }
    });

    return Object.values(stages).map((stage) => ({
      ...stage,
      value: Math.round(stage.value / 1000), // Convert to thousands for chart display
    }));
  };

  // Lead source performance function - now accepts opportunities as an argument
  const getLeadSourcePerformance = (opportunitiesToProcess) => {
    const sources = {};
    opportunitiesToProcess.forEach((opp) => {
      const source = opp.lead_source || "unknown";
      if (!sources[source]) {
        sources[source] = { count: 0, revenue: 0, closed: 0 };
      }
      sources[source].count++;
      if (opp.stage === "closed_won") {
        sources[source].closed++;
        sources[source].revenue += opp.amount || 0;
      }
    });

    return Object.entries(sources).map(([name, data]) => ({
      source: name,
      opportunities: data.count,
      revenue: Math.round(data.revenue / 1000), // Convert to thousands
      winRate: data.count > 0
        ? Math.round((data.closed / data.count) * 100)
        : 0,
    }));
  };

  // Calculate key metrics - these now depend on the 'opportunities' state
  const totalPipelineValue = opportunities.reduce(
    (sum, opp) => sum + (opp.amount || 0),
    0,
  );
  const closedWon = opportunities.filter((opp) => opp.stage === "closed_won");
  const closedLost = opportunities.filter((opp) => opp.stage === "closed_lost");
  // Avoid division by zero for winRate calculation
  const totalClosedOpportunities = closedWon.length + closedLost.length;
  const winRate = totalClosedOpportunities > 0
    ? (closedWon.length / totalClosedOpportunities) * 100
    : 0;
  const avgDealSize = closedWon.length > 0
    ? closedWon.reduce((sum, opp) => sum + (opp.amount || 0), 0) /
      closedWon.length
    : 0;

  // Calculate sales cycle length
  const avgSalesCycle = closedWon.reduce((sum, opp) => {
    if (opp.close_date && opp.created_date) {
      const closeDate = new Date(opp.close_date);
      const createdDate = new Date(opp.created_date);
      // Ensure dates are valid before calculating difference
      if (!isNaN(closeDate.getTime()) && !isNaN(createdDate.getTime())) {
        return sum + differenceInDays(closeDate, createdDate);
      }
    }
    return sum;
  }, 0) / Math.max(closedWon.length, 1); // Avoid division by zero

  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Total Pipeline
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  ${(totalPipelineValue / 1000).toFixed(0)}K
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Win Rate</p>
                <p className="text-2xl font-bold text-slate-100">
                  {winRate.toFixed(1)}%
                </p>
              </div>
              <Award className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Avg Deal Size
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  ${(avgDealSize / 1000).toFixed(0)}K
                </p>
              </div>
              <Target className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Sales Cycle
                </p>
                <p className="text-2xl font-bold text-slate-100">
                  {Math.round(avgSalesCycle)} days
                </p>
              </div>
              <Calendar className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger
            value="6months"
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400"
          >
            Last 6 Months
          </TabsTrigger>
          <TabsTrigger
            value="12months"
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400"
          >
            Last 12 Months
          </TabsTrigger>
        </TabsList>

        <TabsContent value={period} className="space-y-6">
          {/* Monthly Revenue Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Monthly Revenue Trend ($K)
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Closed-won revenue over time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dealsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: "#94a3b8" }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <Tooltip
                      formatter={(value) => [`$${value}K`, "Revenue"]}
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: "8px",
                        color: "#f1f5f9",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-lg bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Deals Closed by Month
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Number of opportunities closed-won each month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dealsOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis
                      dataKey="month"
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
                    <Bar dataKey="deals" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Pipeline by Stage ($K)
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Current pipeline value by sales stage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={revenueByStage}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => {
                        // Only show labels for slices that are 3% or larger to avoid overlap
                        if (percent >= 0.03) {
                          return `${name} (${(percent * 100).toFixed(0)}%)`;
                        }
                        return "";
                      }}
                      labelLine={false}
                    >
                      {revenueByStage.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`$${value}K`, "Pipeline Value"]}
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
                        paddingTop: "20px",
                        color: "#f1f5f9",
                        fontSize: "12px",
                      }}
                      formatter={(value) => {
                        const item = revenueByStage.find((item) =>
                          item.name === value
                        );
                        const total = revenueByStage.reduce(
                          (sum, item) => sum + item.value,
                          0,
                        );
                        const percent = total > 0
                          ? ((item?.value || 0) / total * 100).toFixed(0)
                          : 0;
                        return `${value} (${percent}%)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-lg bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Lead Source Performance
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Opportunities and revenue by lead source.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {leadSourcePerformance.length > 0
                    ? (
                      leadSourcePerformance.map((source) => (
                        <div
                          key={source.source}
                          className="flex items-center justify-between p-3 bg-slate-700 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-slate-200 capitalize">
                              {source.source}
                            </p>
                            <p className="text-sm text-slate-400">
                              {source.opportunities}{" "}
                              opportunities • ${source.revenue}K revenue
                            </p>
                          </div>
                          <Badge
                            variant={source.winRate > 30
                              ? "default"
                              : source.winRate > 15
                              ? "secondary"
                              : "outline"}
                            className="ml-4 bg-slate-600 text-slate-200 border-slate-500"
                          >
                            {source.winRate}% win rate
                          </Badge>
                        </div>
                      ))
                    )
                    : (
                      <p className="text-sm text-slate-400">
                        No lead source data available.
                      </p>
                    )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
