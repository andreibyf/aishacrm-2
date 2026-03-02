import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Lead } from '@/api/entities';
// User entity no longer needed here; user comes from context
import { useUser } from '@/components/shared/useUser.js';
import { useApiManager } from '../components/shared/ApiManager';
import { clearDashboardResultsCache } from '@/api/dashboard';
import { clearAllDashboardCaches } from '@/api/dashboardCache';
import LeadCard from '../components/leads/LeadCard';
const LeadForm = lazy(() => import('../components/leads/LeadForm'));
const LeadDetailPanel = lazy(() => import('../components/leads/LeadDetailPanel'));
const LeadConversionDialog = lazy(() => import('../components/leads/LeadConversionDialog'));
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  Building2,
  Edit,
  Eye,
  Grid,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import CsvExportButton from '../components/shared/CsvExportButton';
const CsvImportDialog = lazy(() => import('../components/shared/CsvImportDialog'));
import { useTenant } from '../components/shared/tenantContext';
import Pagination from '../components/shared/Pagination';
import { toast } from 'sonner';
import TagFilter from '../components/shared/TagFilter';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import RefreshButton from '../components/shared/RefreshButton';
import { useLoadingToast } from '@/hooks/useLoadingToast';
import { useProgress } from '@/components/shared/ProgressOverlay';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import BulkActionsMenu from '../components/leads/BulkActionsMenu';
import LeadStatsCards from '../components/leads/LeadStatsCards';
import LeadTable from '../components/leads/LeadTable';
import LeadFilters from '../components/leads/LeadFilters';
// Switch to internal profile page; stop using mintLeadLink
import StatusHelper from '../components/shared/StatusHelper';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { useConfirmDialog } from '../components/shared/ConfirmDialog';
import { useAiShaEvents } from '@/hooks/useAiShaEvents';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { useLeadsData } from '@/hooks/useLeadsData';
import { useLeadsBulkOps } from '@/hooks/useLeadsBulkOps';

export default function LeadsPage() {
  const { user } = useUser();
  const { plural: leadsLabel, singular: leadLabel } = useEntityLabel('leads');
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();
  const loadingToast = useLoadingToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [sortField, setSortField] = useState('created_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [selectedLeads, setSelectedLeads] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Removed local user state; using global context
  const { selectedTenantId } = useTenant();
  const [detailLead, setDetailLead] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [convertingLead, setConvertingLead] = useState(null);
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();
  const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
  const [showTestData, setShowTestData] = useState(true); // Default to showing all data including test data

  // Define age buckets matching dashboard
  const ageBuckets = useMemo(
    () => [
      { label: 'All Ages', value: 'all' },
      {
        label: '0-7 days',
        min: 0,
        max: 7,
        value: '0-7',
        color: 'text-green-400',
      },
      {
        label: '8-14 days',
        min: 8,
        max: 14,
        value: '8-14',
        color: 'text-blue-400',
      },
      {
        label: '15-21 days',
        min: 15,
        max: 21,
        value: '15-21',
        color: 'text-yellow-400',
      },
      {
        label: '22-30 days',
        min: 22,
        max: 30,
        value: '22-30',
        color: 'text-orange-400',
      },
      {
        label: '30+ days',
        min: 31,
        max: 99999,
        value: '30+',
        color: 'text-red-400',
      },
    ],
    [],
  );

  // Sort options for leads
  const sortOptions = useMemo(
    () => [
      { label: 'Newest First', field: 'created_date', direction: 'desc' },
      { label: 'Oldest First', field: 'created_date', direction: 'asc' },
      { label: 'Company A-Z', field: 'company', direction: 'asc' },
      { label: 'Company Z-A', field: 'company', direction: 'desc' },
      { label: 'Name A-Z', field: 'last_name', direction: 'asc' },
      { label: 'Name Z-A', field: 'last_name', direction: 'desc' },
      { label: 'Status', field: 'status', direction: 'asc' },
      { label: 'Recently Updated', field: 'updated_date', direction: 'desc' },
    ],
    [],
  );

  // Helper function to calculate lead age
  const calculateLeadAge = (lead) => {
    // Use created_date if available, otherwise fall back to created_at
    const dateValue = lead?.created_date || lead?.created_at || lead;
    const today = new Date();
    const created = new Date(dateValue);
    if (isNaN(created.getTime())) return -1; // Return -1 or handle as error for invalid dates
    return Math.floor((today - created) / (1000 * 60 * 60 * 24));
  };

  // Helper function to get age bucket for a lead
  const getLeadAgeBucket = (lead) => {
    const age = calculateLeadAge(lead);
    return ageBuckets.find(
      (bucket) => bucket.value !== 'all' && age >= bucket.min && age <= bucket.max,
    );
  };

  // Derived state for manager role
  const isManager = useMemo(() => {
    if (!user) return false;
    return (
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      user.role === 'manager' ||
      user.employee_role === 'manager' ||
      user.employee_role === 'director'
    );
  }, [user]);

  // Derived state for Superadmin role for controlling test data visibility
  const isSuperadmin = useMemo(() => {
    if (!user) return false;
    return user.role === 'superadmin';
  }, [user]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { cachedRequest, clearCache, clearCacheByKey } = useApiManager();
  const { selectedEmail } = useEmployeeScope();

  // Extract data loading to custom hook
  const {
    leads,
    setLeads,
    users,
    employees,
    accounts,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadLeads,
    loadTotalStats,
    refreshAccounts,
    getTenantFilter,
    allTags,
    usersMap,
    employeesMap,
    accountsMap,
    getAssociatedAccountName,
    initialLoadDone,
  } = useLeadsData({
    selectedTenantId,
    employeeScope: selectedEmail,
    statusFilter,
    searchTerm,
    sortField,
    sortDirection,
    ageFilter,
    selectedTags,
    showTestData,
    currentPage,
    pageSize,
    ageBuckets,
    user,
    loadingToast,
    leadsLabel,
    cachedRequest,
    clearCacheByKey,
    clearCache,
    setDetailLead,
    setIsDetailOpen,
    setCurrentPage,
  });

  // Extract bulk operations to custom hook
  const { handleBulkDelete, handleBulkStatusChange, handleBulkAssign } = useLeadsBulkOps({
    leads,
    selectedLeads,
    setSelectedLeads,
    selectAllMode,
    setSelectAllMode,
    totalItems,
    getTenantFilter,
    statusFilter,
    searchTerm,
    selectedTags,
    ageFilter,
    ageBuckets,
    calculateLeadAge,
    loadLeads,
    loadTotalStats,
    startProgress,
    updateProgress,
    completeProgress,
    confirm,
    clearCache,
    clearCacheByKey,
    clearDashboardResultsCache,
    clearAllDashboardCaches,
    setLeads,
    setTotalItems,
    currentPage,
    pageSize,
    user,
  });

  // Listen for AiSHA open-details events to open the detail panel
  useEffect(() => {
    const handleAiShaOpenDetails = (event) => {
      const { id, type } = event.detail || {};
      // Only handle leads type
      if (type !== 'leads' || !id) return;

      console.log('[Leads] AiSHA open-details event received:', { id, type });

      // Find the lead in current data or fetch it
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        setDetailLead(lead);
        setIsDetailOpen(true);
      } else {
        // Lead not in current page, fetch it directly
        Lead.get(id)
          .then((fetchedLead) => {
            if (fetchedLead) {
              setDetailLead(fetchedLead);
              setIsDetailOpen(true);
            }
          })
          .catch((err) => {
            console.error('[Leads] Failed to fetch lead for detail panel:', err);
          });
      }
    };

    window.addEventListener('aisha:open-details', handleAiShaOpenDetails);
    return () => window.removeEventListener('aisha:open-details', handleAiShaOpenDetails);
  }, [leads]);

  // Handle page change
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle page size change
  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  const handleSave = async (result) => {
    try {
      // Reset to page 1 to show the newly created/updated lead
      setCurrentPage(1);

      // Clear cache and reload BEFORE closing the dialog
      // Also refresh accounts in case a new account was created during lead save
      clearCache('Lead');
      clearCacheByKey('Lead');

      // Brief delay to ensure backend cache invalidation has propagated
      await new Promise((r) => setTimeout(r, 150));

      // Reload leads, stats, and accounts
      await Promise.all([
        loadLeads(1, pageSize), // Always load page 1 to show the lead
        loadTotalStats(),
        refreshAccounts(),
      ]);

      // Now close the dialog after data is fresh
      setIsFormOpen(false);
      setEditingLead(null);
      console.log('[Leads.handleSave] Data reloaded successfully');
    } catch (error) {
      console.error('[Leads.handleSave] Failed to reload data after save:', {
        error,
        message: error?.message,
        stack: error?.stack,
        result,
      });
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete lead?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    try {
      await Lead.delete(id);

      // Optimistic UI: remove immediately so user sees instant feedback
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setTotalItems((prev) => Math.max(0, prev - 1));
      toast.success('Lead deleted successfully');

      // Clear all caches so dashboard and lead lists show fresh data
      clearCache('Lead');
      clearCacheByKey('Lead');
      clearDashboardResultsCache();
      clearAllDashboardCaches();
      await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
    } catch (error) {
      console.error('Failed to delete lead:', error);
      toast.error('Failed to delete lead');
      await loadLeads(currentPage, pageSize);
      await loadTotalStats();
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedLeads);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedLeads(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length && leads.length > 0) {
      setSelectedLeads(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedLeads(new Set(leads.map((l) => l.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedLeads(new Set(leads.map((l) => l.id))); // This will still select only current page for display, but logic marks all
  };

  const handleClearSelection = () => {
    setSelectedLeads(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (lead) => {
    setDetailLead(lead);
    setIsDetailOpen(true);
  };

  const handleConvert = (lead) => {
    setConvertingLead(lead);
    setIsConversionDialogOpen(true);
  };

  const handleConversionSuccess = async (result) => {
    // Optimistically update the lead status in the local state
    if (convertingLead) {
      setLeads((prevLeads) =>
        prevLeads.map((l) =>
          l.id === convertingLead.id
            ? {
                ...l,
                status: 'converted',
                converted_contact_id: result?.contact?.id,
                converted_account_id: result?.accountId,
              }
            : l,
        ),
      );
    }

    toast.success('Lead converted successfully');
    setIsConversionDialogOpen(false);
    setConvertingLead(null);

    // Clear cache and refresh in background - don't block UI
    clearCache('Lead');
    clearCacheByKey('Lead');
    clearCache('Contact');
    clearCache('Account');
    clearCache('Opportunity');
    // Fire and forget - UI is already updated optimistically
    loadLeads(currentPage, pageSize);
    loadTotalStats();
  };

  const handleRefresh = async () => {
    clearCache('Lead');
    clearCacheByKey('Lead');
    clearCache('Employee');
    clearCache('User');
    clearCache('Account');
    await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
    toast.success('Leads refreshed');
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setAgeFilter('all');
    setSelectedTags([]);
    setSortField('created_date');
    setSortDirection('desc');
    setCurrentPage(1);
    handleClearSelection();
  };

  // AiSHA events listener - allows AI to trigger page actions
  useAiShaEvents({
    entityType: 'leads',
    onOpenEdit: ({ id }) => {
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        setEditingLead(lead);
        setIsFormOpen(true);
      } else {
        // Lead not in current page, try to fetch it
        Lead.filter({ id }).then((result) => {
          if (result && result.length > 0) {
            setEditingLead(result[0]);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      // Highlight the row and open detail panel
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        setDetailLead(lead);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingLead(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm !== '' ||
      statusFilter !== 'all' ||
      ageFilter !== 'all' ||
      selectedTags.length > 0 ||
      sortField !== 'created_date' ||
      sortDirection !== 'desc'
    );
  }, [searchTerm, statusFilter, ageFilter, selectedTags, sortField, sortDirection]);

  // Matching the stat card colors - semi-transparent backgrounds
  const statusColors = {
    new: 'bg-blue-900/20 text-blue-300 border-blue-700',
    contacted: 'bg-indigo-900/20 text-indigo-300 border-indigo-700',
    qualified: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
    unqualified: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
    converted: 'bg-green-900/20 text-green-300 border-green-700',
    lost: 'bg-red-900/20 text-red-300 border-red-700',
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                {editingLead ? `Edit ${leadLabel}` : `Add New ${leadLabel}`}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {editingLead
                  ? `Update ${leadLabel.toLowerCase()} information and status`
                  : `Add a new ${leadLabel.toLowerCase()} to your sales pipeline`}
              </DialogDescription>
            </DialogHeader>
            <Suspense
              fallback={
                <div className="p-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              }
            >
              <LeadForm
                lead={editingLead}
                onSave={handleSave}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingLead(null);
                }}
                user={user}
                employees={employees}
                isManager={isManager}
              />
            </Suspense>
          </DialogContent>
        </Dialog>

        <Suspense fallback={null}>
          <CsvImportDialog
            open={isImportOpen}
            onOpenChange={setIsImportOpen}
            schema={Lead.schema ? Lead.schema() : null}
            onSuccess={async () => {
              clearCache('Lead');
              clearCacheByKey('Lead');
              await Promise.all([loadLeads(1, pageSize), loadTotalStats()]);
            }}
          />
        </Suspense>

        <Suspense fallback={null}>
          <LeadConversionDialog
            lead={convertingLead}
            accounts={accounts}
            open={isConversionDialogOpen}
            onClose={() => setIsConversionDialogOpen(false)}
            onConvert={handleConversionSuccess}
          />
        </Suspense>

        <Suspense fallback={null}>
          <LeadDetailPanel
            lead={detailLead}
            assignedUserName={
              detailLead?.assigned_to_name ||
              employeesMap[detailLead?.assigned_to] ||
              usersMap[detailLead?.assigned_to]
            }
            open={isDetailOpen}
            onOpenChange={() => {
              setIsDetailOpen(false);
              setDetailLead(null);
            }}
            onEdit={(lead) => {
              setEditingLead(lead);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            onConvert={(lead) => {
              setIsDetailOpen(false);
              handleConvert(lead);
            }}
            user={user}
            associatedAccountName={getAssociatedAccountName(detailLead)}
          />
        </Suspense>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">{leadsLabel}</h1>
            <p className="text-slate-400 mt-1">
              Track and manage your sales {leadsLabel.toLowerCase()} and prospects.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSuperadmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showTestData ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setShowTestData(!showTestData);
                      setCurrentPage(1); // Reset page on filter change
                      clearCache('Lead');
                      clearCacheByKey('Lead'); // Clear cache as filter changes leads data
                    }}
                    className={
                      showTestData
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    }
                  >
                    {showTestData ? (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Showing Test Data
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Show Test Data
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{showTestData ? 'Hide test/sample data' : 'Show test/sample data'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === 'list' ? (
                    <Grid className="w-4 h-4" />
                  ) : (
                    <List className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Switch to {viewMode === 'list' ? 'card' : 'list'} view</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Import leads from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton entityName="Lead" data={leads} filename="leads_export" />
            {(selectedLeads.size > 0 || selectAllMode) && (
              <BulkActionsMenu
                selectedCount={selectAllMode ? totalItems : selectedLeads.size}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkAssign={handleBulkAssign}
                onBulkDelete={handleBulkDelete}
                employees={employees}
                selectAllMode={selectAllMode}
                totalCount={totalItems}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingLead(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add {leadLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {leadLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <LeadStatsCards
          totalStats={totalStats}
          statusFilter={statusFilter}
          onStatusFilterClick={handleStatusFilterClick}
          leadsLabel={leadsLabel}
          isCardVisible={isCardVisible}
          getCardLabel={getCardLabel}
        />

        {/* Search and Filters */}
        <LeadFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          ageFilter={ageFilter}
          setAgeFilter={setAgeFilter}
          ageBuckets={ageBuckets}
          allTags={allTags}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          sortField={sortField}
          sortDirection={sortDirection}
          setSortField={setSortField}
          setSortDirection={setSortDirection}
          sortOptions={sortOptions}
          hasActiveFilters={hasActiveFilters}
          handleClearFilters={handleClearFilters}
          setCurrentPage={setCurrentPage}
        />

        {/* Select All Banner */}
        {selectedLeads.size === leads.length &&
          leads.length > 0 &&
          !selectAllMode &&
          totalItems > leads.length && (
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-400" />
                <span className="text-blue-200">
                  All {leads.length} leads on this page are selected.
                </span>
                <Button
                  variant="link"
                  onClick={handleSelectAllRecords}
                  className="text-blue-400 hover:text-blue-300 p-0 h-auto"
                >
                  Select all {totalItems} leads matching current filters
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

        {selectAllMode && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200 font-semibold">
                All {totalItems} leads matching current filters are selected.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-slate-400 hover:text-slate-200"
            >
              Clear selection
            </Button>
          </div>
        )}

        {loading && !initialLoadDone.current ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-slate-400">Loading leads...</p>
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">
              No {leadsLabel.toLowerCase()} found
            </h3>
            <p className="text-slate-500 mb-6">
              {hasActiveFilters
                ? 'Try adjusting your filters or search term'
                : `Get started by adding your first ${leadLabel.toLowerCase()}`}
            </p>
            {!hasActiveFilters && (
              <Button onClick={() => setIsFormOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First {leadLabel}
              </Button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <>
            {/* List/Table View */}
            <LeadTable
              leads={leads}
              selectedLeads={selectedLeads}
              selectAllMode={selectAllMode}
              toggleSelectAll={toggleSelectAll}
              toggleSelection={toggleSelection}
              calculateLeadAge={calculateLeadAge}
              getLeadAgeBucket={getLeadAgeBucket}
              getAssociatedAccountName={getAssociatedAccountName}
              employeesMap={employeesMap}
              usersMap={usersMap}
              setDetailLead={setDetailLead}
              setIsDetailOpen={setIsDetailOpen}
              setEditingLead={setEditingLead}
              setIsFormOpen={setIsFormOpen}
              handleConvert={handleConvert}
              handleDelete={handleDelete}
              leadLabel={leadLabel}
            />

            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / pageSize)}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              loading={loading}
            />
          </>
        ) : (
          <>
            {/* Card View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    accountName={getAssociatedAccountName(lead)}
                    onEdit={(l) => {
                      setEditingLead(l);
                      setIsFormOpen(true);
                    }}
                    onDelete={handleDelete}
                    onViewDetails={handleViewDetails}
                    onClick={() => handleViewDetails(lead)}
                    isSelected={selectedLeads.has(lead.id) || selectAllMode}
                    onSelect={() => toggleSelection(lead.id)}
                    onConvert={handleConvert}
                    user={user}
                  />
                ))}
              </AnimatePresence>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / pageSize)}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              loading={loading}
            />
          </>
        )}
      </div>
      <ConfirmDialogPortal />
    </TooltipProvider>
  );
}
