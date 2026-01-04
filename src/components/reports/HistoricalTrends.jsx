import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calendar,
  DollarSign,
  Loader2,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Contact, Lead, Opportunity } from "@/api/entities";

export default function HistoricalTrends({ tenantFilter }) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30");
  const [trendsData, setTrendsData] = useState([]);
  const [summaryStats, setSummaryStats] = useState({
    totalContacts: 0,
    totalLeads: 0,
    totalOpportunities: 0,
    totalValue: 0,
  });

  const loadTrendsData = useCallback(async () => {
    setLoading(true);
    try {
      // DEFENSIVE UNWRAPPING - handle both array and wrapped responses
      const unwrap = (result) => {
        // Already an array - return as-is
        if (Array.isArray(result)) return result;
        
        // Wrapped in { data: [...] } shape
        if (result?.data && Array.isArray(result.data)) return result.data;
        
        // Wrapped in { status: "success", data: [...] } shape
        if (result?.status === 'success' && Array.isArray(result.data)) return result.data;
        
        // Invalid response - log warning and return empty array
        console.warn("HistoricalTrends: API response not in expected format:", result);
        return [];
      };

      console.log("HistoricalTrends: Using filter:", tenantFilter);

      // Calculate date range
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999); // Ensure endDate includes the entire current day
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - parseInt(timeRange) + 1); // +1 to include startDate itself in the range
      startDate.setHours(0, 0, 0, 0); // Ensure startDate includes the very beginning of the day

      console.log("HistoricalTrends: Date range:", {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      // Load data with tenant filter
      const effectiveFilter = { ...tenantFilter };
      if (!("is_test_data" in effectiveFilter)) {
        effectiveFilter.is_test_data = false;
      }

      const [contactsResult, leadsResult, opportunitiesResult] = await Promise.all([
        Contact.filter(effectiveFilter).catch(() => null),
        Lead.filter(effectiveFilter).catch(() => null),
        Opportunity.filter(effectiveFilter).catch(() => null),
      ]);

      const contacts = unwrap(contactsResult);
      const leads = unwrap(leadsResult);
      const opportunities = unwrap(opportunitiesResult);

      console.log("HistoricalTrends: Fetched data:", {
        contacts: contacts.length,
        leads: leads.length,
        opportunities: opportunities.length,
      });

      // Log sample dates from fetched data
      if (contacts.length > 0) {
        console.log("HistoricalTrends: Sample contact dates:", {
          first: contacts[0]?.created_date,
          second: contacts[1]?.created_date,
          third: contacts[2]?.created_date,
        });
      }
      if (leads.length > 0) {
        console.log("HistoricalTrends: Sample lead dates:", {
          first: leads[0]?.created_date,
          second: leads[1]?.created_date,
          third: leads[2]?.created_date,
        });
      }
      if (opportunities.length > 0) {
        console.log("HistoricalTrends: Sample opportunity dates:", {
          first: opportunities[0]?.created_date,
          second: opportunities[1]?.created_date,
          third: opportunities[2]?.created_date,
        });
      }

      // Filter data by date range for the trend
      const filterByDateRange = (items, dateField = "created_date") => {
        return items.filter((item, index) => {
          if (!item[dateField]) {
            if (index < 5) {
              console.log(
                `HistoricalTrends: Missing date field: '${dateField}' for item ID: ${item.id}`,
              );
            }
            return false;
          }
          const itemDate = new Date(item[dateField]);
          // Adjust itemDate to its specific day's start for comparison with startDate, and end for endDate
          const itemDateDayStart = new Date(
            itemDate.getFullYear(),
            itemDate.getMonth(),
            itemDate.getDate(),
            0,
            0,
            0,
            0,
          );
          const itemDateDayEnd = new Date(
            itemDate.getFullYear(),
            itemDate.getMonth(),
            itemDate.getDate(),
            23,
            59,
            59,
            999,
          );

          const inRange = itemDateDayStart >= startDate &&
            itemDateDayEnd <= endDate;

          if (!inRange && index < 5) { // Log only a few examples to avoid console spam
            console.log("HistoricalTrends: Item date out of range:", {
              itemId: item.id,
              itemDate: itemDate.toISOString(),
              itemDateDayStart: itemDateDayStart.toISOString(),
              itemDateDayEnd: itemDateDayEnd.toISOString(),
              rangeStart: startDate.toISOString(),
              rangeEnd: endDate.toISOString(),
              isBeforeStart: itemDateDayStart < startDate,
              isAfterEnd: itemDateDayEnd > endDate,
            });
          }

          return inRange;
        });
      };

      const filteredContacts = filterByDateRange(contacts, "created_date");
      const filteredLeads = filterByDateRange(leads, "created_date");
      const filteredOpportunities = filterByDateRange(
        opportunities,
        "created_date",
      );

      console.log("HistoricalTrends: Filtered by date range:", {
        contacts: filteredContacts.length,
        leads: filteredLeads.length,
        opportunities: filteredOpportunities.length,
        dateRange:
          `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
      });

      // Calculate summary stats (for the selected period)
      const totalValue = filteredOpportunities.reduce(
        (sum, opp) => sum + (opp.amount || 0),
        0,
      );
      setSummaryStats({
        totalContacts: filteredContacts.length,
        totalLeads: filteredLeads.length,
        totalOpportunities: filteredOpportunities.length,
        totalValue,
      });

      // Group data by day for trend analysis
      const dailyData = {};
      const dayCount = parseInt(timeRange);

      // Initialize all days with zero values
      for (let i = 0; i < dayCount; i++) {
        const date = new Date(endDate); // Start from endDate and go backwards
        date.setDate(endDate.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        dailyData[dateStr] = {
          date: dateStr,
          contacts: 0,
          leads: 0,
          opportunities: 0,
          value: 0,
        };
      }

      // Count contacts by day
      filteredContacts.forEach((contact) => {
        const dateStr =
          new Date(contact.created_date).toISOString().split("T")[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].contacts++;
        }
      });

      // Count leads by day
      filteredLeads.forEach((lead) => {
        const dateStr = new Date(lead.created_date).toISOString().split("T")[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].leads++;
        }
      });

      // Count opportunities by day
      filteredOpportunities.forEach((opportunity) => {
        const dateStr =
          new Date(opportunity.created_date).toISOString().split("T")[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].opportunities++;
          dailyData[dateStr].value += opportunity.amount || 0;
        }
      });

      // Convert to array and sort by date
      const trendsArray = Object.values(dailyData).sort((a, b) =>
        new Date(a.date) - new Date(b.date)
      );

      // Format dates for display
      const formattedTrends = trendsArray.map((item) => ({
        ...item,
        displayDate: new Date(item.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }));

      console.log(
        "HistoricalTrends: Final trends data sample (last 5 days):",
        formattedTrends.slice(-5),
      );

      setTrendsData(formattedTrends);
    } catch (error) {
      console.error("Error loading trends data:", error);
      setTrendsData([]);
    } finally {
      setLoading(false);
    }
  }, [tenantFilter, timeRange]);

  useEffect(() => {
    loadTrendsData();
  }, [loadTrendsData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">
            Loading historical trends...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">
            Historical Trends
          </h2>
          <p className="text-slate-400">New records created over time</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              New Contacts
            </CardTitle>
            <Users className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {summaryStats.totalContacts}
            </div>
            <p className="text-xs text-slate-500">Created in selected period</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              New Leads
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {summaryStats.totalLeads}
            </div>
            <p className="text-xs text-slate-500">Created in selected period</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              New Opportunities
            </CardTitle>
            <Target className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {summaryStats.totalOpportunities}
            </div>
            <p className="text-xs text-slate-500">Created in selected period</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Pipeline Value
            </CardTitle>
            <DollarSign className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              ${summaryStats.totalValue.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500">From new opportunities</p>
          </CardContent>
        </Card>
      </div>

      {/* Trends Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">
              Daily Activity Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
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
                <Legend wrapperStyle={{ color: "#f1f5f9" }} />
                <Line
                  type="monotone"
                  dataKey="contacts"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Contacts"
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Leads"
                />
                <Line
                  type="monotone"
                  dataKey="opportunities"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Opportunities"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">
              Daily Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
                <Tooltip
                  formatter={(value) => [`$${value.toLocaleString()}`, "Value"]}
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
                <Bar dataKey="value" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {summaryStats.totalContacts === 0 && summaryStats.totalLeads === 0 &&
        summaryStats.totalOpportunities === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">
              No New Records in This Period
            </h3>
            <p className="text-slate-400">
              No contacts, leads, or opportunities were created in the last{" "}
              {timeRange}{" "}
              days. Try selecting a longer time period to see historical data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
