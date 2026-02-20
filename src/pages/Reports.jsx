import { lazy, useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Building2,
  CheckSquare,
  Database,
  DollarSign,
  FileDigit,
  FileSpreadsheet,
  Loader2,
  Target,
  TrendingUp,
  Brain,
  Download,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useUser } from '@/components/shared/useUser.js';
import { Lead } from '@/api/entities';
import { Contact } from '@/api/entities';
import { Opportunity } from '@/api/entities';
import { Activity } from '@/api/entities';
import { Tenant } from '@/api/entities';

// DEBUG: Check imports in Reports.jsx
console.log('Reports.jsx IMPORT CHECK:', {
  Lead: typeof Lead,
  Contact: typeof Contact,
  Opportunity: typeof Opportunity,
  Activity: typeof Activity,
  LeadFilter: typeof Lead?.filter,
  OpportunityFilter: typeof Opportunity?.filter,
  LeadKeys: Lead ? Object.keys(Lead).join(', ') : 'null',
});
if (typeof Lead?.filter !== 'function') {
  alert(
    `Reports.jsx: Lead.filter is ${typeof Lead?.filter}. Lead = ${JSON.stringify(Object.keys(Lead || {}))}`,
  );
}

import { useTenant } from '../components/shared/tenantContext';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import { useApiManager } from '../components/shared/ApiManager';
import { toast } from 'react-hot-toast';

// Lazy load chart-heavy components to reduce entry bundle size
// These components use Recharts (~385KB) which gets split into separate chunk
const OverviewStats = lazy(() => import('../components/reports/OverviewStats'));
const SalesAnalytics = lazy(() => import('../components/reports/SalesAnalytics'));
const LeadAnalytics = lazy(() => import('../components/reports/LeadAnalytics'));
const ProductivityAnalytics = lazy(() => import('../components/reports/ProductivityAnalytics'));
const HistoricalTrends = lazy(() => import('../components/reports/HistoricalTrends'));
const ForecastingDashboard = lazy(() => import('../components/reports/ForecastingDashboard'));

import AIMarketInsights from '../components/reports/AIMarketInsights';
import DataQualityReport from '../components/reports/DataQualityReport';
import CustomQuery from '../components/reports/CustomQuery';
import { exportReportToCSV } from '@/api/functions';
import { getBackendUrl } from '@/api/backendUrl';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { user: currentUser, loading: userLoading } = useUser();
  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState(null);
  const { selectedTenantId } = useTenant();
  const { getFilter, canViewAllRecords } = useEmployeeScope();
  const [isExporting, setIsExporting] = useState(false);
  const { cachedRequest } = useApiManager();
  const [currentTenantData, setCurrentTenantData] = useState(null);
  // User provided by global context

  // NEW: Load current tenant data
  useEffect(() => {
    const loadTenantData = async () => {
      if (!currentUser) return;

      if (currentUser.role === 'superadmin' && selectedTenantId) {
        try {
          const tenant = await cachedRequest('Tenant', 'get', { id: selectedTenantId }, () =>
            Tenant.get(selectedTenantId),
          );
          setCurrentTenantData(tenant);
        } catch (error) {
          console.error('Failed to load tenant data:', error);
          setCurrentTenantData(null);
        }
      } else if (currentUser.tenant_id) {
        try {
          const tenant = await cachedRequest('Tenant', 'get', { id: currentUser.tenant_id }, () =>
            Tenant.get(currentUser.tenant_id),
          );
          setCurrentTenantData(tenant);
        } catch (error) {
          console.error('Failed to load tenant data:', error);
          setCurrentTenantData(null);
        }
      }
    };

    loadTenantData();
  }, [currentUser, selectedTenantId, cachedRequest]);

  const currentScopedFilter = useMemo(() => {
    let baseFilter = {};
    if (!currentUser) {
      return {};
    }

    if (currentUser.role === 'superadmin') {
      if (selectedTenantId) {
        baseFilter.tenant_id = selectedTenantId;
      }
    } else if (currentUser.tenant_id) {
      baseFilter.tenant_id = currentUser.tenant_id;
    }

    // Guard: For superadmin/admin without a selected tenant, do not load data
    if (
      (currentUser.role === 'superadmin' || currentUser.role === 'admin') &&
      !baseFilter.tenant_id
    ) {
      return {};
    }

    let filter = {};
    if (canViewAllRecords) {
      filter = { ...baseFilter };
    } else {
      filter = getFilter(baseFilter);
    }

    // Use boolean filter instead of Mongo-style operators
    if (!('is_test_data' in filter)) {
      filter.is_test_data = false;
    }
    return filter;
  }, [currentUser, selectedTenantId, canViewAllRecords, getFilter]);

  useEffect(() => {
    const loadStats = async () => {
      if (!currentUser || Object.keys(currentScopedFilter).length === 0) {
        setStats(null);
        return;
      }

      setLoadingStats(true);
      try {
        const [leads, contacts, opportunities, activities] = await Promise.all([
          cachedRequest('Lead', 'filter', { filter: currentScopedFilter }, () =>
            Lead.filter(currentScopedFilter),
          ),
          cachedRequest('Contact', 'filter', { filter: currentScopedFilter }, () =>
            Contact.filter(currentScopedFilter),
          ),
          cachedRequest('Opportunity', 'filter', { filter: currentScopedFilter }, () =>
            Opportunity.filter(currentScopedFilter),
          ),
          cachedRequest('Activity', 'filter', { filter: currentScopedFilter }, () =>
            Activity.filter(currentScopedFilter),
          ),
        ]);

        // UNWRAP: cachedRequest may return pagination objects like { activities: [], total, limit, offset }
        // We need to extract the actual array from these objects
        const unwrapResult = (result, entityName) => {
          if (Array.isArray(result)) return result;
          // Check if it's a pagination object with the entity name as a property
          const lowerEntityName = entityName.toLowerCase() + 's'; // "activity" -> "activities"
          if (result && typeof result === 'object' && Array.isArray(result[lowerEntityName])) {
            return result[lowerEntityName];
          }
          // Only warn if unwrapping failed - if we reach here, result is not an array and not a valid pagination object
          console.warn(`Reports.jsx: Failed to unwrap ${entityName}, got:`, typeof result, result);
          return [];
        };

        const safeLeads = unwrapResult(leads, 'lead');
        const safeContacts = unwrapResult(contacts, 'contact');
        const safeOpportunities = unwrapResult(opportunities, 'opportunity');
        const safeActivities = unwrapResult(activities, 'activity');

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
        const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
        const startOfPreviousMonth = new Date(currentYear, currentMonth - 1, 1);
        const endOfPreviousMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

        const activitiesThisMonth =
          safeActivities.filter((a) => {
            const createdDate = new Date(a.created_date);
            return createdDate >= startOfCurrentMonth && createdDate <= endOfCurrentMonth;
          }).length || 0;

        const activitiesLastMonth =
          safeActivities.filter((a) => {
            const createdDate = new Date(a.created_date);
            return createdDate >= startOfPreviousMonth && createdDate <= endOfPreviousMonth;
          }).length || 0;

        const totalLeads = safeLeads.length || 0;
        const totalContacts = safeContacts.length || 0;
        const totalOpportunities = safeOpportunities.length || 0;

        setStats({
          totalLeads,
          totalContacts,
          totalOpportunities,
          activitiesThisMonth,
          activitiesLastMonth,
        });
      } catch (error) {
        console.error('Failed to load overview stats:', error);
        toast.error('Failed to load overview data');
        setStats(null);
      } finally {
        setLoadingStats(false);
      }
    };

    loadStats();
  }, [currentUser, currentScopedFilter, cachedRequest]);

  if (userLoading) {
    return (
      <div className="p-4 lg:p-8 text-center text-slate-400 bg-slate-900 min-h-screen">
        <div className="flex items-center justify-center h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 lg:w-12 lg:h-12 animate-spin mx-auto text-blue-400" />
            <p className="mt-3 text-sm lg:text-base">Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="p-8 text-center bg-slate-900 min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-lg">Please log in to view reports.</p>
      </div>
    );
  }

  if (currentUser.role === 'superadmin' && !selectedTenantId) {
    return (
      <div className="p-4 lg:p-8 text-center bg-slate-900 min-h-screen">
        <div className="max-w-md mx-auto bg-orange-950/20 border border-orange-700/50 rounded-lg p-6">
          <Building2 className="w-8 h-8 lg:w-12 lg:h-12 text-orange-400 mx-auto mb-4" />
          <h2 className="text-lg lg:text-xl font-semibold text-orange-300 mb-2">Select a Tenant</h2>
          <p className="text-sm lg:text-base text-orange-500">
            Please select a tenant from the dropdown in the header to view their reports.
          </p>
        </div>
      </div>
    );
  }

  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      if (format === 'pdf') {
        const BACKEND_URL = getBackendUrl();

        // Special handling for AI Insights - use POST with insights data
        if (activeTab === 'insights') {
          // Try to get insights data from the component's data attribute
          const insightsElement = document.querySelector('[data-ai-insights]');
          const insightsData = insightsElement?.getAttribute('data-ai-insights');

          if (!insightsData || insightsData === 'null') {
            toast.error('Please generate insights first before exporting');
            setIsExporting(false);
            return;
          }

          try {
            const insights = JSON.parse(insightsData);
            const response = await fetch(`${BACKEND_URL}/api/reports/export-insights-pdf`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenant_id: currentScopedFilter?.tenant_id,
                tenant_name: currentTenantData?.name || 'Unknown Tenant',
                industry: currentTenantData?.industry || 'Not specified',
                business_model: currentTenantData?.business_model || 'B2B',
                geographic_focus: currentTenantData?.geographic_focus || 'North America',
                insights,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Failed to generate PDF');
            }

            // Download the PDF
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ai_insights_report_${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('AI Insights PDF downloaded successfully!');
            setIsExporting(false);
            return;
          } catch (parseError) {
            console.error('Error parsing insights data:', parseError);
            toast.error('Failed to export insights. Please try regenerating them.');
            setIsExporting(false);
            return;
          }
        }

        // Standard PDF export for other report types
        const params = new URLSearchParams();
        if (currentScopedFilter?.tenant_id) {
          params.append('tenant_id', currentScopedFilter.tenant_id);
        }
        params.append('report_type', activeTab);

        const url = `${BACKEND_URL}/api/reports/export-pdf?${params.toString()}`;

        // Open in new tab to download
        const link = document.createElement('a');
        link.href = url;
        link.download = `${activeTab}_report_${Date.now()}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success('PDF report is being generated...');
        setIsExporting(false);
        return;
      }

      // For CSV export
      let response;
      if (format === 'csv') {
        response = await exportReportToCSV({
          reportType: activeTab,
          tenantFilter: currentScopedFilter,
        });
      }

      if (response && response.data) {
        const blob = new Blob([response.data], { type: response.headers['content-type'] });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const contentDisposition = response.headers['content-disposition'];
        let fileName = `${activeTab}_report.${format}`;
        if (contentDisposition) {
          const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
          if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
        }

        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else if (response && response.error) {
        console.error('Export failed with API error:', response.error);
        toast.error(`Export failed: ${response.error}`);
      } else {
        const errorData = response?.data
          ? JSON.parse(new TextDecoder().decode(response.data))
          : { error: 'Unknown export error' };
        throw new Error(errorData.error || 'Export failed, no data received.');
      }
    } catch (error) {
      console.error(`Error exporting to ${format}:`, error);
      toast.error(`Failed to export report: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const reportTabs = [
    {
      id: 'overview',
      label: 'Overview',
      icon: TrendingUp,
      iconColor: 'text-purple-400',
      component: (
        <>
          <OverviewStats
            tenantFilter={currentScopedFilter}
            stats={stats}
            loadingStats={loadingStats}
          />
          <HistoricalTrends tenantFilter={currentScopedFilter} />
        </>
      ),
    },
    {
      id: 'sales',
      label: 'Sales Analytics',
      icon: DollarSign,
      iconColor: 'text-green-500',
      component: <SalesAnalytics tenantFilter={currentScopedFilter} />,
    },
    {
      id: 'leads',
      label: 'Lead Analytics',
      icon: TrendingUp,
      iconColor: 'text-yellow-400',
      component: <LeadAnalytics tenantFilter={currentScopedFilter} />,
    },
    {
      id: 'productivity',
      label: 'Productivity',
      icon: CheckSquare,
      iconColor: 'text-orange-500',
      component: <ProductivityAnalytics tenantFilter={currentScopedFilter} />,
    },
    {
      id: 'forecasting',
      label: 'Forecasting',
      icon: Target,
      iconColor: 'text-amber-500',
      component: <ForecastingDashboard tenantFilter={currentScopedFilter} />,
    },
    {
      id: 'insights',
      label: 'AI Insights',
      icon: Brain,
      iconColor: 'text-pink-500',
      component: <AIMarketInsights tenant={currentTenantData} />,
    },
    {
      id: 'data-quality',
      label: 'Data Quality',
      icon: Database,
      iconColor: 'text-cyan-400',
      component: <DataQualityReport tenantFilter={currentScopedFilter} />,
    },
    {
      id: 'custom-query',
      label: 'Custom Query',
      icon: Sparkles,
      iconColor: 'text-violet-400',
      component: <CustomQuery tenantFilter={currentScopedFilter} />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-2 sm:p-4 lg:p-8 space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-purple-900/30 border border-purple-700/50">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-purple-400" />
            </div>
            <span>Reports & Analytics</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm lg:text-base">
            Comprehensive insights into your business performance.
          </p>
        </div>

        <div className="flex-shrink-0 w-full sm:w-auto mt-4 lg:mt-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={isExporting}
                className="w-full sm:w-auto bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Exporting...</span>
                    <span className="sm:hidden">Exporting</span>
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Export Report</span>
                    <span className="sm:hidden">Export</span>
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-slate-800 border-slate-700 text-slate-200"
            >
              <DropdownMenuItem
                onClick={() => handleExport('pdf')}
                className="hover:bg-slate-700 focus:bg-slate-700"
              >
                <FileDigit className="mr-2 h-4 w-4 text-red-400" />
                <span>Export as PDF</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport('csv')}
                className="hover:bg-slate-700 focus:bg-slate-700"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4 text-green-400" />
                <span>Export as CSV</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 lg:space-y-6">
        <div className="lg:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-200">
              <SelectValue>
                {(() => {
                  const currentReport = reportTabs.find((tab) => tab.id === activeTab);
                  return currentReport ? (
                    <div className="flex items-center gap-2">
                      <currentReport.icon className={`w-4 h-4 ${currentReport.iconColor}`} />
                      <span className="truncate">{currentReport.label}</span>
                    </div>
                  ) : (
                    'Select a report...'
                  );
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
              {reportTabs.map((report) => (
                <SelectItem
                  key={report.id}
                  value={report.id}
                  className="hover:bg-slate-700 focus:bg-slate-700"
                >
                  <div className="flex items-center gap-2">
                    <report.icon className={`w-4 h-4 ${report.iconColor}`} />
                    <span>{report.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden lg:block bg-slate-800 rounded-lg shadow-sm border border-slate-700 p-4">
          <TabsList className="flex flex-wrap gap-2 bg-transparent p-0 h-auto">
            {reportTabs.map((report) => (
              <TabsTrigger
                key={report.id}
                value={report.id}
                className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg border border-slate-600 bg-slate-700 hover:bg-slate-600 data-[state=active]:bg-purple-600 data-[state=active]:border-purple-500 data-[state=active]:text-white text-slate-300 text-xs lg:text-sm font-medium transition-all duration-200"
              >
                <report.icon
                  className={`w-4 h-4 ${activeTab === report.id ? 'text-white' : report.iconColor}`}
                />
                <span className="hidden sm:inline">{report.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="bg-slate-800 rounded-lg shadow-sm border border-slate-700">
          {reportTabs.map((report) => (
            <TabsContent key={report.id} value={report.id} className="p-3 sm:p-4 lg:p-6 m-0">
              <div className="lg:hidden mb-4 pb-4 border-b border-slate-700">
                <h2 className="text-base lg:text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <report.icon className={`w-5 h-5 ${report.iconColor}`} />
                  {report.label}
                </h2>
              </div>
              <div className="space-y-4">{activeTab === report.id ? report.component : null}</div>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
