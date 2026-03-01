import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Award, Calendar, DollarSign, Target } from 'lucide-react';
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
} from 'recharts';
import { differenceInDays, format, startOfMonth, subMonths } from 'date-fns';
import { Opportunity } from '@/api/entities';

const COLORS_MAP = [
  ['#60a5fa', '#3b82f6'], // blue
  ['#34d399', '#10b981'], // emerald
  ['#fbbf24', '#f59e0b'], // amber
  ['#f87171', '#ef4444'], // red
  ['#a78bfa', '#8b5cf6'], // violet
  ['#2dd4bf', '#059669'], // teal
];

// Changed component props to accept tenantFilter instead of direct opportunities/accounts
export default function SalesAnalytics({ tenantFilter }) {
  const [period, setPeriod] = useState('6months');
  // State to hold the fetched opportunities
  const [opportunities, setOpportunities] = useState([]);
  // States to hold the processed data for charts
  const [revenueByStage, setRevenueByStage] = useState([]);
  const [dealsOverTime, setDealsOverTime] = useState([]);
  const [leadSourcePerformance, setLeadSourcePerformance] = useState([]);

  // useEffect to fetch and process data when tenantFilter or period changes
  useEffect(() => {
    const fetchAndProcessSalesData = async () => {
      // DEFENSIVE UNWRAPPING - handle both array and wrapped responses
      const unwrap = (result) => {
        // Already an array - return as-is
        if (Array.isArray(result)) return result;

        // Wrapped in { data: [...] } shape
        if (result?.data && Array.isArray(result.data)) return result.data;

        // Wrapped in { status: "success", data: [...] } shape
        if (result?.status === 'success' && Array.isArray(result.data)) return result.data;

        // Invalid response - log warning and return empty array
        return [];
      };

      // Assuming Opportunity.filter is an async function that fetches opportunities
      // based on the provided tenantFilter (e.g., tenantId, or 'all' for superadmin)
      const fetchedOpportunitiesResult = await Opportunity.filter(tenantFilter);
      const fetchedOpportunities = unwrap(fetchedOpportunitiesResult);
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
    const months = currentPeriod === '12months' ? 12 : 6;
    const monthlyData = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i));
      const monthEnd = startOfMonth(subMonths(new Date(), i - 1)); // Correctly represents the start of the next month
      const monthName = format(monthStart, 'MMM yyyy');

      const monthOpps = opportunitiesToProcess.filter((opp) => {
        // Ensure close_date exists and is a valid date string
        if (!opp.close_date) return false;
        const closeDate = new Date(opp.close_date);
        return closeDate >= monthStart && closeDate < monthEnd && opp.stage === 'closed_won';
      });

      const monthlyRevenue = monthOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);

      monthlyData.push({
        month: monthName,
        revenue: Math.round(monthlyRevenue / 1000), // Convert to thousands
        deals: monthOpps.length,
        avgDeal: monthOpps.length > 0 ? Math.round(monthlyRevenue / monthOpps.length / 1000) : 0,
      });
    }
    return monthlyData;
  };

  // Stage distribution function - now accepts opportunities as an argument
  const getStageDistribution = (opportunitiesToProcess) => {
    const stages = {
      prospecting: { name: 'Prospecting', count: 0, value: 0 },
      qualification: { name: 'Qualification', count: 0, value: 0 },
      proposal: { name: 'Proposal', count: 0, value: 0 },
      negotiation: { name: 'Negotiation', count: 0, value: 0 },
      closed_won: { name: 'Closed Won', count: 0, value: 0 },
      closed_lost: { name: 'Closed Lost', count: 0, value: 0 },
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
      const source = opp.lead_source || 'unknown';
      if (!sources[source]) {
        sources[source] = { count: 0, revenue: 0, closed: 0 };
      }
      sources[source].count++;
      if (opp.stage === 'closed_won') {
        sources[source].closed++;
        sources[source].revenue += opp.amount || 0;
      }
    });

    return Object.entries(sources).map(([name, data]) => ({
      source: name,
      opportunities: data.count,
      revenue: Math.round(data.revenue / 1000), // Convert to thousands
      winRate: data.count > 0 ? Math.round((data.closed / data.count) * 100) : 0,
    }));
  };

  // Calculate key metrics - these now depend on the 'opportunities' state
  const totalPipelineValue = opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
  const closedWon = opportunities.filter((opp) => opp.stage === 'closed_won');
  const closedLost = opportunities.filter((opp) => opp.stage === 'closed_lost');
  // Avoid division by zero for winRate calculation
  const totalClosedOpportunities = closedWon.length + closedLost.length;
  const winRate =
    totalClosedOpportunities > 0 ? (closedWon.length / totalClosedOpportunities) * 100 : 0;
  const avgDealSize =
    closedWon.length > 0
      ? closedWon.reduce((sum, opp) => sum + (opp.amount || 0), 0) / closedWon.length
      : 0;

  // Calculate sales cycle length
  const avgSalesCycle =
    closedWon.reduce((sum, opp) => {
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
                <p className="text-sm font-medium text-slate-400">Total Pipeline</p>
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
                <p className="text-2xl font-bold text-slate-100">{winRate.toFixed(1)}%</p>
              </div>
              <Award className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Avg Deal Size</p>
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
                <p className="text-sm font-medium text-slate-400">Sales Cycle</p>
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
                <CardTitle className="text-lg text-slate-100">Monthly Revenue Trend ($K)</CardTitle>
                <CardDescription className="text-slate-400">
                  Closed-won revenue over time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dealsOverTime}>
                    <defs>
                      <linearGradient id="colorRevenueLine" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={false}
                      dx={-10}
                    />
                    <Tooltip
                      cursor={{ stroke: '#34d399', strokeWidth: 1, strokeDasharray: '3 3' }}
                      formatter={(value) => [`$${value}K`, 'Revenue']}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        boxShadow:
                          '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      }}
                      itemStyle={{ color: '#34d399' }}
                      labelStyle={{ color: '#f1f5f9' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#34d399"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#34d399' }}
                      activeDot={{ r: 8, stroke: '#10b981', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-lg bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">Deals Closed by Month</CardTitle>
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
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#f1f5f9',
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
                <CardTitle className="text-lg text-slate-100">Pipeline by Stage ($K)</CardTitle>
                <CardDescription className="text-slate-400">
                  Current pipeline value by sales stage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <defs>
                      {COLORS_MAP.map((colorPair, index) => (
                        <linearGradient
                          key={`gradSalesAnalytics-${index}`}
                          id={`gradSalesAnalytics-${index}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={colorPair[0]} stopOpacity={1} />
                          <stop offset="100%" stopColor={colorPair[1]} stopOpacity={1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={revenueByStage.filter((s) => s.value > 0)}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={60}
                      paddingAngle={5}
                      cornerRadius={8}
                      fill="#8884d8"
                      dataKey="value"
                      labelLine={false}
                      label={({ name, percent, x, y, midAngle }) => {
                        if (percent < 0.05) return null;
                        const RADIAN = Math.PI / 180;
                        const sin = Math.sin(-RADIAN * midAngle);
                        const cos = Math.cos(-RADIAN * midAngle);
                        const sx = x;
                        const sy = y;
                        const mx = x + (120 - 100) * cos;
                        const my = y + (120 - 100) * sin;
                        const ex = mx + (cos >= 0 ? 1 : -1) * 22;
                        const ey = my;
                        const textAnchor = cos >= 0 ? 'start' : 'end';

                        return (
                          <g>
                            <path
                              d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
                              stroke="#94a3b8"
                              fill="none"
                            />
                            <circle cx={ex} cy={ey} r={2} fill="#94a3b8" />
                            <text
                              x={ex + (cos >= 0 ? 1 : -1) * 12}
                              y={ey}
                              textAnchor={textAnchor}
                              fill="#e2e8f0"
                              fontSize={12}
                            >{`${name} (${(percent * 100).toFixed(0)}%)`}</text>
                          </g>
                        );
                      }}
                    >
                      {revenueByStage
                        .filter((s) => s.value > 0)
                        .map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={`url(#gradSalesAnalytics-${index % COLORS_MAP.length})`}
                            stroke="rgba(0,0,0,0.1)"
                          />
                        ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`$${value}K`, 'Pipeline Value']}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        boxShadow:
                          '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-lg bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">Lead Source Performance</CardTitle>
                <CardDescription className="text-slate-400">
                  Revenue and win rate by lead source.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={leadSourcePerformance}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="colorRevenueBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="colorWinRateBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <YAxis
                      type="category"
                      dataKey="source"
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      width={80}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                        boxShadow:
                          '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar
                      dataKey="revenue"
                      name="Revenue ($K)"
                      fill="url(#colorRevenueBar)"
                      radius={[0, 6, 6, 0]}
                      barSize={15}
                    />
                    <Bar
                      dataKey="winRate"
                      name="Win Rate (%)"
                      fill="url(#colorWinRateBar)"
                      radius={[0, 6, 6, 0]}
                      barSize={15}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
