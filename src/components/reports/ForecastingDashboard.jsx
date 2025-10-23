
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, Calendar, DollarSign, Target, Loader2, AlertCircle } from 'lucide-react';
import { Opportunity, Lead } from '@/api/entities';
import { User } from '@/api/entities';
import { getTenantFilter } from '../shared/tenantUtils';
import { useTenant } from '../shared/tenantContext';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForecastingDashboard() {
  const [loading, setLoading] = useState(true);
  const [forecastPeriod, setForecastPeriod] = useState('90');
  const [user, setUser] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [pipelineMetrics, setPipelineMetrics] = useState({
    totalPipeline: 0,
    weightedPipeline: 0,
    forecastedRevenue: 0,
    conversionRate: 0
  });
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Error loading user:', error);
      }
    };
    loadUser();
  }, []);

  const getDefaultProbability = useCallback((stage) => {
    const stageProbabilities = {
      'prospecting': 10,
      'qualification': 25,
      'proposal': 50,
      'negotiation': 75,
      'closed_won': 100,
      'closed_lost': 0
    };
    return stageProbabilities[stage] || 25;
  }, []); // No dependencies, as it's a static mapping

  const generateDailyForecast = useCallback((opportunities, days) => {
    const forecast = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Find opportunities expected to close on this date
      const closingOpps = opportunities.filter(opp => {
        if (!opp.close_date) return false;
        const closeDate = new Date(opp.close_date);
        return closeDate.toISOString().split('T')[0] === dateStr;
      });

      const expectedRevenue = closingOpps.reduce((sum, opp) => {
        const probability = opp.probability || getDefaultProbability(opp.stage);
        return sum + ((opp.amount || 0) * (probability / 100));
      }, 0);

      const potentialRevenue = closingOpps.reduce((sum, opp) => sum + (opp.amount || 0), 0);

      forecast.push({
        date: dateStr,
        displayDate: date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        }),
        expectedRevenue,
        potentialRevenue,
        opportunities: closingOpps.length
      });
    }

    return forecast;
  }, [getDefaultProbability]); // Depends on getDefaultProbability

  const loadForecastData = useCallback(async () => {
    if (!user) return; // Ensure user is loaded before making API calls
    
    setLoading(true);
    try {
      const tenantFilter = getTenantFilter(user, selectedTenantId);
      
      const [opportunities, leads] = await Promise.all([
        Opportunity.filter(tenantFilter).catch(() => []),
        Lead.filter(tenantFilter).catch(() => [])
      ]);

      // Calculate pipeline metrics
      const activeOpportunities = opportunities.filter(opp => 
        opp.stage !== 'closed_won' && opp.stage !== 'closed_lost'
      );

      const totalPipeline = activeOpportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
      
      // Calculate weighted pipeline (amount * probability)
      const weightedPipeline = activeOpportunities.reduce((sum, opp) => {
        const probability = opp.probability || getDefaultProbability(opp.stage);
        return sum + ((opp.amount || 0) * (probability / 100));
      }, 0);

      // Calculate conversion rate from leads
      const convertedLeads = leads.filter(lead => lead.status === 'converted').length;
      const totalLeads = leads.length;
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

      // Generate forecast for the selected period
      const forecastDays = parseInt(forecastPeriod);
      const dailyForecast = generateDailyForecast(activeOpportunities, forecastDays);

      setPipelineMetrics({
        totalPipeline,
        weightedPipeline,
        forecastedRevenue: weightedPipeline,
        conversionRate
      });

      setForecastData(dailyForecast);
    } catch (error) {
      console.error('Error loading forecast data:', error);
      setForecastData([]);
    } finally {
      setLoading(false);
    }
  }, [user, forecastPeriod, selectedTenantId, getDefaultProbability, generateDailyForecast]); // All external dependencies

  useEffect(() => {
    loadForecastData();
  }, [loadForecastData]); // Now depends only on the memoized loadForecastData

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Loading forecast data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Revenue Forecasting</h2>
          <p className="text-slate-400">Predict future revenue based on current pipeline</p>
        </div>
        <Select value={forecastPeriod} onValueChange={setForecastPeriod}>
          <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="180">Next 6 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Alert className="bg-slate-800 border-slate-700">
        <AlertCircle className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-slate-300">
          Forecasts are based on current pipeline data and stage probabilities. Accuracy depends on data quality and regular updates.
        </AlertDescription>
      </Alert>

      {/* Pipeline Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Pipeline</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">${pipelineMetrics.totalPipeline.toLocaleString()}</div>
            <p className="text-xs text-slate-500">Active opportunities</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Weighted Pipeline</CardTitle>
            <Target className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">${pipelineMetrics.weightedPipeline.toLocaleString()}</div>
            <p className="text-xs text-slate-500">Probability adjusted</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Forecasted Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">${pipelineMetrics.forecastedRevenue.toLocaleString()}</div>
            <p className="text-xs text-slate-500">Expected to close</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{pipelineMetrics.conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-slate-500">Lead to opportunity</p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Revenue Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  formatter={(value) => [`$${value.toLocaleString()}`, 'Revenue']} 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #475569', 
                    borderRadius: '8px', 
                    color: '#f1f5f9' 
                  }} 
                />
                <Legend wrapperStyle={{ color: '#f1f5f9' }} />
                <Line 
                  type="monotone" 
                  dataKey="expectedRevenue" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  name="Expected Revenue" 
                />
                <Line 
                  type="monotone" 
                  dataKey="potentialRevenue" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  strokeDasharray="5 5" 
                  name="Potential Revenue" 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Opportunities Closing</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #475569', 
                    borderRadius: '8px', 
                    color: '#f1f5f9' 
                  }} 
                />
                <Bar dataKey="opportunities" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {forecastData.length === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Forecast Data</h3>
            <p className="text-slate-400">Add opportunities with close dates to see revenue forecasts.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
