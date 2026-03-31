import { logDev } from '@/utils/devLogger';
import { useEffect, useMemo, useState } from 'react';
import { Opportunity } from '@/api/entities';
import { useApiManager } from '../components/shared/ApiManager';
import OpportunityCard from '../components/opportunities/OpportunityCard';
import OpportunityForm from '../components/opportunities/OpportunityForm';
import OpportunityDetailPanel from '../components/opportunities/OpportunityDetailPanel';
import OpportunityKanbanBoard from '../components/opportunities/OpportunityKanbanBoard';
import BulkActionsMenu from '../components/opportunities/BulkActionsMenu';
import OpportunityStatsCards from '../components/opportunities/OpportunityStatsCards';
import OpportunityFilters from '../components/opportunities/OpportunityFilters';
import OpportunityTable from '../components/opportunities/OpportunityTable';
import { Button } from '@/components/ui/button';
import { AlertCircle, AppWindow, Grid, List, Loader2, Plus, Upload, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import CsvExportButton from '../components/shared/CsvExportButton';
import CsvImportDialog from '../components/shared/CsvImportDialog';
import { useTenant } from '../components/shared/tenantContext';
import Pagination from '../components/shared/Pagination';
import { toast } from 'sonner';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import RefreshButton from '../components/shared/RefreshButton';
import { useLoadingToast } from '@/hooks/useLoadingToast';
import { useProgress } from '@/components/shared/ProgressOverlay';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SimpleModal from '../components/shared/SimpleModal';
import { useConfirmDialog } from '../components/shared/ConfirmDialog';
import { useUser } from '@/components/shared/useUser.js';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { useAiShaEvents } from '@/hooks/useAiShaEvents';
import { useOpportunitiesData } from '@/hooks/useOpportunitiesData';
import { useOpportunitiesBulkOps } from '@/hooks/useOpportunitiesBulkOps';

export default function OpportunitiesPage() {
  const { plural: opportunitiesLabel, singular: opportunityLabel } =
    useEntityLabel('opportunities');
  const loadingToast = useLoadingToast();
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const { selectedEmail } = useEmployeeScope();
  const { isCardVisible, getCardLabel } = useStatusCardPreferences();
  const { cachedRequest, clearCacheByKey } = useApiManager();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();

  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sortField, setSortField] = useState('updated_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'grid' : 'table',
  );
  const [selectedOpportunities, setSelectedOpportunities] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Auto-switch to card view on mobile screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e) => setViewMode(e.matches ? 'grid' : 'table');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [detailOpportunity, setDetailOpportunity] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [showTestData] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sort options
  const sortOptions = useMemo(
    () => [
      { label: 'Recently Updated', field: 'updated_at', direction: 'desc' },
      { label: 'Oldest Updated', field: 'updated_at', direction: 'asc' },
      { label: 'Newest First', field: 'created_at', direction: 'desc' },
      { label: 'Oldest First', field: 'created_at', direction: 'asc' },
      { label: 'Name A-Z', field: 'name', direction: 'asc' },
      { label: 'Name Z-A', field: 'name', direction: 'desc' },
      { label: 'Value (Highest)', field: 'value', direction: 'desc' },
      { label: 'Value (Lowest)', field: 'value', direction: 'asc' },
      { label: 'Close Date', field: 'close_date', direction: 'asc' },
    ],
    [],
  );

  // Data hook
  const {
    opportunities,
    setOpportunities,
    accounts,
    contacts,
    leads,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadOpportunities,
    loadTotalStats,
    getTenantFilter,
    allTags,
    usersMap,
    employeesMap,
    accountsMap,
    initialLoadDone,
    handlePageChange,
    handlePageSizeChange,
    resetSupportingData,
    resetPaginationCursors,
  } = useOpportunitiesData({
    selectedTenantId,
    employeeScope: selectedEmail,
    stageFilter,
    assignedToFilter,
    searchTerm,
    sortField,
    sortDirection,
    selectedTags,
    showTestData,
    currentPage,
    pageSize,
    viewMode,
    user,
    loadingToast,
    opportunitiesLabel,
    cachedRequest,
    clearCacheByKey,
    setDetailOpportunity,
    setIsDetailOpen,
    setCurrentPage,
  });

  // Bulk ops hook
  const { handleBulkDelete, handleBulkStageChange, handleBulkAssign } = useOpportunitiesBulkOps({
    opportunities,
    selectedOpportunities,
    setSelectedOpportunities,
    selectAllMode,
    setSelectAllMode,
    totalItems,
    getTenantFilter,
    stageFilter,
    searchTerm,
    selectedTags,
    loadOpportunities,
    loadTotalStats,
    startProgress,
    updateProgress,
    completeProgress,
    confirm,
    clearCacheByKey,
    setOpportunities,
    setTotalItems,
    currentPage,
    pageSize,
  });

  // --- Local handlers ---

  const handleSave = async () => {
    const wasCreating = !editingOpportunity;
    try {
      if (wasCreating) setCurrentPage(1);
      clearCacheByKey('Opportunity');
      await Promise.all([
        loadOpportunities(wasCreating ? 1 : currentPage, pageSize),
        loadTotalStats(),
      ]);
      setIsFormOpen(false);
      setEditingOpportunity(null);
    } catch (error) {
      console.error('[Opportunities] Error in handleSave:', error);
      setIsFormOpen(false);
      setEditingOpportunity(null);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete opportunity?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    try {
      await Opportunity.delete(id);
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
      setTotalItems((prev) => (prev > 0 ? prev - 1 : 0));
      toast.success('Opportunity deleted successfully');

      await new Promise((resolve) => setTimeout(resolve, 100));
      clearCacheByKey('Opportunity');
      await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
    } catch (error) {
      console.error('Failed to delete opportunity:', error);
      toast.error('Failed to delete opportunity');
      await loadOpportunities(currentPage, pageSize);
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedOpportunities);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedOpportunities(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedOpportunities.size === opportunities.length && opportunities.length > 0) {
      setSelectedOpportunities(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedOpportunities(new Set(opportunities.map((o) => o.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedOpportunities(new Set(opportunities.map((o) => o.id)));
  };

  const handleClearSelection = () => {
    setSelectedOpportunities(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (opportunity) => {
    setDetailOpportunity(opportunity);
    setIsDetailOpen(true);
  };

  const handleRefresh = async () => {
    clearCacheByKey('Opportunity');
    clearCacheByKey('Employee');
    clearCacheByKey('Account');
    clearCacheByKey('Contact');
    clearCacheByKey('Lead');
    clearCacheByKey('User');
    resetSupportingData();
    await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
    toast.success('Opportunities refreshed');
  };

  const handleStageFilterClick = (stage) => {
    setStageFilter(stage);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStageFilter('all');
    setAssignedToFilter('all');
    setSelectedTags([]);
    setCurrentPage(1);
    resetPaginationCursors();
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm !== '' ||
      stageFilter !== 'all' ||
      assignedToFilter !== 'all' ||
      selectedTags.length > 0
    );
  }, [searchTerm, stageFilter, assignedToFilter, selectedTags]);

  const handleStageChange = async (opportunityId, newStage) => {
    try {
      logDev('[Opportunities] handleStageChange:', { opportunityId, newStage });
      const updateData = { stage: newStage, tenant_id: selectedTenantId };
      await Opportunity.update(opportunityId, updateData);

      clearCacheByKey('Opportunity');
      await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
      toast.success(`Opportunity moved to ${newStage.replace(/_/g, ' ')}`);

      const updated = await Opportunity.filter(
        { id: opportunityId, tenant_id: selectedTenantId },
        'id',
        1,
      ).then((r) => r[0]);
      return updated;
    } catch (error) {
      console.error('Error updating opportunity stage:', error);
      toast.error('Failed to update opportunity stage');
      return null;
    }
  };

  // AiSHA events listener
  useAiShaEvents({
    entityType: 'opportunities',
    onOpenEdit: ({ id }) => {
      const opportunity = opportunities.find((o) => o.id === id);
      if (opportunity) {
        setEditingOpportunity(opportunity);
        setIsFormOpen(true);
      } else {
        Opportunity.get(id).then((result) => {
          if (result) {
            setEditingOpportunity(result);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      const opportunity = opportunities.find((o) => o.id === id);
      if (opportunity) {
        setDetailOpportunity(opportunity);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingOpportunity(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  // --- Render ---

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading user information...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <SimpleModal
          open={isFormOpen}
          onOpenChange={(open) => {
            setIsFormOpen(open);
            if (!open) setEditingOpportunity(null);
          }}
          title={editingOpportunity ? `Edit ${opportunityLabel}` : `Add New ${opportunityLabel}`}
          size="lg"
        >
          <OpportunityForm
            opportunity={editingOpportunity}
            accounts={accounts}
            contacts={contacts}
            users={users}
            leads={leads}
            onSubmit={async (result) => {
              logDev('[Opportunities] Form submitted with result:', result);
              await handleSave();
            }}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingOpportunity(null);
            }}
          />
        </SimpleModal>

        <CsvImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          schema={Opportunity.schema ? Opportunity.schema() : null}
          onSuccess={async () => {
            clearCacheByKey('Opportunity');
            await Promise.all([loadOpportunities(1, pageSize), loadTotalStats()]);
          }}
        />

        {isDetailOpen && detailOpportunity && (
          <OpportunityDetailPanel
            opportunity={detailOpportunity}
            accounts={accounts}
            contacts={contacts}
            users={users}
            employees={employees}
            leads={leads}
            onClose={() => {
              setIsDetailOpen(false);
              setDetailOpportunity(null);
            }}
            onEdit={(opp) => {
              setEditingOpportunity(opp);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            onStageChange={handleStageChange}
          />
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">{opportunitiesLabel}</h1>
            <p className="text-slate-400 mt-1">
              Track and manage your sales {opportunitiesLabel.toLowerCase()} and pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (viewMode === 'table') setViewMode('grid');
                    else if (viewMode === 'grid') setViewMode('kanban');
                    else setViewMode('table');
                  }}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === 'table' ? (
                    <List className="w-4 h-4" />
                  ) : viewMode === 'grid' ? (
                    <Grid className="w-4 h-4" />
                  ) : (
                    <AppWindow className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Switch view</p>
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
                <p>Import opportunities from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton
              entityName="Opportunity"
              data={opportunities}
              filename="opportunities_export"
            />
            {(selectedOpportunities.size > 0 || selectAllMode) && viewMode !== 'kanban' && (
              <BulkActionsMenu
                selectedCount={selectAllMode ? totalItems : selectedOpportunities.size}
                onBulkStageChange={handleBulkStageChange}
                onBulkAssign={handleBulkAssign}
                onBulkDelete={handleBulkDelete}
                selectAllMode={selectAllMode}
                totalCount={totalItems}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingOpportunity(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add {opportunityLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {opportunityLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <OpportunityStatsCards
          totalStats={totalStats}
          stageFilter={stageFilter}
          onStageFilterClick={handleStageFilterClick}
          opportunitiesLabel={opportunitiesLabel}
          isCardVisible={isCardVisible}
          getCardLabel={getCardLabel}
        />

        {/* Filters (hidden in kanban) */}
        {viewMode !== 'kanban' && (
          <OpportunityFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            allTags={allTags}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            employees={employees}
            assignedToFilter={assignedToFilter}
            setAssignedToFilter={setAssignedToFilter}
            sortField={sortField}
            sortDirection={sortDirection}
            setSortField={setSortField}
            setSortDirection={setSortDirection}
            sortOptions={sortOptions}
            hasActiveFilters={hasActiveFilters}
            handleClearFilters={handleClearFilters}
            setCurrentPage={setCurrentPage}
          />
        )}

        {/* Select All Banners */}
        {viewMode !== 'kanban' &&
          selectedOpportunities.size === opportunities.length &&
          opportunities.length > 0 &&
          !selectAllMode &&
          totalItems > opportunities.length && (
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-400" />
                <span className="text-blue-200">
                  All {opportunities.length} opportunities on this page are selected.
                </span>
                <Button
                  variant="link"
                  onClick={handleSelectAllRecords}
                  className="text-blue-400 hover:text-blue-300 p-0 h-auto"
                >
                  Select all {totalItems} opportunities matching current filters
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

        {viewMode !== 'kanban' && selectAllMode && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200 font-semibold">
                All {totalItems} opportunities matching current filters are selected.
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

        {/* Main Content */}
        {loading && !initialLoadDone.current ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-slate-400">Loading opportunities...</p>
            </div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">
              No {opportunitiesLabel.toLowerCase()} found
            </h3>
            <p className="text-slate-500 mb-6">
              {hasActiveFilters
                ? 'Try adjusting your filters or search term'
                : `Get started by adding your first ${opportunityLabel.toLowerCase()}`}
            </p>
            {!hasActiveFilters && (
              <Button onClick={() => setIsFormOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First {opportunityLabel}
              </Button>
            )}
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="overflow-x-auto">
            <OpportunityKanbanBoard
              opportunities={opportunities}
              accounts={accounts}
              contacts={contacts}
              users={users}
              leads={leads}
              onEdit={(opp) => {
                setEditingOpportunity(opp);
                setIsFormOpen(true);
              }}
              onDelete={handleDelete}
              onView={handleViewDetails}
              onStageChange={handleStageChange}
              onDataRefresh={async () => {
                clearCacheByKey('Opportunity');
                await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
              }}
            />
          </div>
        ) : viewMode === 'grid' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {opportunities.map((opp) => {
                  const account = accounts.find((a) => a.id === opp.account_id);
                  const contact = contacts.find((c) => c.id === opp.contact_id);

                  return (
                    <OpportunityCard
                      key={opp.id}
                      opportunity={opp}
                      accountName={account?.name}
                      contactName={contact ? `${contact.first_name} ${contact.last_name}` : ''}
                      assignedUserName={(() => {
                        if (!opp.assigned_to) return undefined;
                        return (
                          employeesMap[opp.assigned_to] ||
                          usersMap[opp.assigned_to] ||
                          opp.assigned_to_name ||
                          opp.assigned_to
                        );
                      })()}
                      onEdit={() => {
                        setEditingOpportunity(opp);
                        setIsFormOpen(true);
                      }}
                      onDelete={() => handleDelete(opp.id)}
                      onViewDetails={() => handleViewDetails(opp)}
                      isSelected={selectedOpportunities.has(opp.id)}
                      onSelect={() => toggleSelection(opp.id)}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / pageSize)}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                handlePageSizeChange(newSize);
              }}
              loading={loading}
            />
          </>
        ) : (
          <>
            <OpportunityTable
              opportunities={opportunities}
              selectedOpportunities={selectedOpportunities}
              selectAllMode={selectAllMode}
              toggleSelectAll={toggleSelectAll}
              toggleSelection={toggleSelection}
              accountsMap={accountsMap}
              employeesMap={employeesMap}
              usersMap={usersMap}
              handleViewDetails={handleViewDetails}
              setEditingOpportunity={setEditingOpportunity}
              setIsFormOpen={setIsFormOpen}
              handleDelete={handleDelete}
              opportunityLabel={opportunityLabel}
              getCardLabel={getCardLabel}
            />
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalItems / pageSize)}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                handlePageSizeChange(newSize);
              }}
              loading={loading}
            />
          </>
        )}
      </div>

      <ConfirmDialogPortal />
    </TooltipProvider>
  );
}
