import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Account, Contact, Lead, Opportunity } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';
import { useApiManager } from '../components/shared/ApiManager';
import { useProgress } from '../components/shared/ProgressOverlay';
import ActivityCard from '../components/activities/ActivityCard';
import ActivityForm from '../components/activities/ActivityForm';
import ActivityDetailPanel from '../components/activities/ActivityDetailPanel';
import ContactDetailPanel from '../components/contacts/ContactDetailPanel';
import AccountDetailPanel from '../components/accounts/AccountDetailPanel';
import LeadDetailPanel from '../components/leads/LeadDetailPanel';
import OpportunityDetailPanel from '../components/opportunities/OpportunityDetailPanel';
import BulkActionsMenu from '../components/activities/BulkActionsMenu';
import ActivityStatsCards from '../components/activities/ActivityStatsCards';
import ActivityFilters from '../components/activities/ActivityFilters';
import ActivityTable from '../components/activities/ActivityTable';
import { Button } from '@/components/ui/button';
import { Plus, Upload, Loader2, Grid, List, AlertCircle, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import CsvExportButton from '../components/shared/CsvExportButton';
import CsvImportDialog from '../components/shared/CsvImportDialog';
import { useTenant } from '../components/shared/tenantContext';
import Pagination from '../components/shared/Pagination';
import { toast } from 'sonner';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import RefreshButton from '../components/shared/RefreshButton';
import { useLoadingToast } from '@/hooks/useLoadingToast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SimpleModal from '../components/shared/SimpleModal';
import { useConfirmDialog } from '../components/shared/ConfirmDialog';
import { format } from 'date-fns';
import { getCurrentTimezoneOffset, utcToLocal } from '../components/shared/timezoneUtils';
import { useTimezone } from '../components/shared/TimezoneContext';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { useAiShaEvents } from '@/hooks/useAiShaEvents';
import { useActivitiesData } from '@/hooks/useActivitiesData';
import { useActivitiesBulkOps } from '@/hooks/useActivitiesBulkOps';

export default function ActivitiesPage() {
  const { plural: activitiesLabel, singular: activityLabel } = useEntityLabel('activities');
  const loadingToast = useLoadingToast();
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const { selectedEmail } = useEmployeeScope();
  const { selectedTimezone } = useTimezone();
  const { isCardVisible, getCardLabel } = useStatusCardPreferences();
  const { cachedRequest, clearCache, clearCacheByKey } = useApiManager();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();

  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortField, setSortField] = useState('due_date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'grid' : 'list',
  );
  const [selectedActivities, setSelectedActivities] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Auto-switch to card view on mobile screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e) => setViewMode(e.matches ? 'grid' : 'list');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [detailActivity, setDetailActivity] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [showTestData, setShowTestData] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Related entity detail panels
  const [viewingRelatedEntity, setViewingRelatedEntity] = useState(null);
  const [relatedEntityType, setRelatedEntityType] = useState(null);
  const [isRelatedDetailOpen, setIsRelatedDetailOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // Sort options
  const sortOptions = useMemo(
    () => [
      { label: 'Due Date (Latest)', field: 'due_date', direction: 'desc' },
      { label: 'Due Date (Earliest)', field: 'due_date', direction: 'asc' },
      { label: 'Recently Updated', field: 'updated_at', direction: 'desc' },
      { label: 'Newest First', field: 'created_at', direction: 'desc' },
      { label: 'Subject A-Z', field: 'subject', direction: 'asc' },
      { label: 'Subject Z-A', field: 'subject', direction: 'desc' },
    ],
    [],
  );

  // Data hook
  const {
    activities,
    setActivities,
    accounts,
    contacts,
    leads,
    opportunities,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadActivities,
    buildFilter,
    allTags,
    usersMap,
    employeesMap,
    initialLoadDone,
    handlePageChange,
    handlePageSizeChange,
  } = useActivitiesData({
    selectedTenantId,
    employeeScope: selectedEmail,
    statusFilter,
    assignedToFilter,
    typeFilter,
    searchTerm,
    sortField,
    sortDirection,
    selectedTags,
    showTestData,
    dateRange,
    currentPage,
    pageSize,
    user,
    loadingToast,
    activitiesLabel,
    cachedRequest,
    clearCache,
    clearCacheByKey,
    setCurrentPage,
  });

  // Bulk ops hook
  const { handleBulkDelete, handleBulkStatusChange, handleBulkAssign } = useActivitiesBulkOps({
    activities,
    selectedActivities,
    setSelectedActivities,
    selectAllMode,
    setSelectAllMode,
    totalItems,
    buildFilter,
    searchTerm,
    selectedTags,
    loadActivities,
    startProgress,
    updateProgress,
    completeProgress,
    clearCache,
    clearCacheByKey,
    setActivities,
    setTotalItems,
    currentPage,
    pageSize,
  });

  // --- Local handlers ---

  const handleSave = async (saved) => {
    const wasEditing = !!editingActivity;
    const editingId = editingActivity?.id || null;

    // Close form immediately — don't make user wait for background reload
    setIsFormOpen(false);
    setEditingActivity(null);

    if (wasEditing && editingId) setUpdatingId(editingId);
    try {
      clearCache('');
      await loadActivities(currentPage, pageSize);
      toast.success(wasEditing ? 'Activity updated successfully' : 'Activity created successfully');
    } catch (error) {
      console.error('[Activities] Error in handleSave:', error);
      toast.error('Failed to refresh activity list');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete activity?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    setDeletingId(id);
    try {
      await Activity.delete(id);
      setActivities((prev) => prev.filter((a) => a.id !== id));
      setTotalItems((prev) => (prev > 0 ? prev - 1 : 0));
      toast.success('Activity deleted successfully');

      await new Promise((resolve) => setTimeout(resolve, 100));
      clearCache('');
      clearCacheByKey('Activity');
      await loadActivities(currentPage, pageSize);
    } catch (error) {
      console.error('Failed to delete activity:', error);
      toast.error('Failed to delete activity');
      await loadActivities(currentPage, pageSize);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedActivities);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedActivities(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedActivities.size === activities.length && activities.length > 0) {
      setSelectedActivities(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedActivities(new Set(activities.map((a) => a.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedActivities(new Set(activities.map((a) => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedActivities(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (activity) => {
    setDetailActivity(activity);
    setIsDetailOpen(true);
  };

  const handleRefresh = async () => {
    clearCache('');
    await loadActivities(currentPage, pageSize);
    toast.success('Activities refreshed');
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSelectedTags([]);
    setAssignedToFilter('all');
    setDateRange({ start: null, end: null });
    setShowTestData(false);
    setCurrentPage(1);
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm !== '' ||
      statusFilter !== 'all' ||
      typeFilter !== 'all' ||
      assignedToFilter !== 'all' ||
      selectedTags.length > 0 ||
      dateRange.start !== null ||
      dateRange.end !== null ||
      showTestData
    );
  }, [
    searchTerm,
    statusFilter,
    typeFilter,
    assignedToFilter,
    selectedTags,
    dateRange,
    showTestData,
  ]);

  // Related entity link helper
  const getRelatedEntityLink = useCallback((activity) => {
    if (!activity.related_to || !activity.related_id) return null;

    const entityMap = {
      contact: { api: Contact, label: 'Contact' },
      account: { api: Account, label: 'Account' },
      lead: { api: Lead, label: 'Lead' },
      opportunity: { api: Opportunity, label: 'Opportunity' },
    };

    const entity = entityMap[activity.related_to];
    if (!entity) return null;

    const handleClick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        const data = await entity.api.get(activity.related_id);
        setViewingRelatedEntity(data);
        setRelatedEntityType(activity.related_to);
        setIsRelatedDetailOpen(true);
      } catch (error) {
        console.error(`Failed to load ${activity.related_to}:`, error);
        toast.error(`Could not load ${entity.label} details`);
      }
    };

    return (
      <button
        type="button"
        className="text-blue-400 hover:text-blue-300 hover:underline text-left"
        onClick={handleClick}
      >
        {activity.related_name || `View ${entity.label}`}
      </button>
    );
  }, []);

  // Date formatting with timezone support
  const formatDisplayDate = useCallback(
    (activity) => {
      if (!activity.due_date) return '—';

      try {
        // Full ISO datetime with timezone offset or UTC Z suffix
        if (
          activity.due_date.includes('T') &&
          (activity.due_date.includes('+') ||
            activity.due_date.includes('-', 10) ||
            activity.due_date.endsWith('Z'))
        ) {
          const parsedDate = new Date(activity.due_date);
          if (!isNaN(parsedDate.getTime())) {
            return format(parsedDate, 'MMM d, yyyy, h:mm a');
          }
        }

        // Legacy: separate due_time field
        if (activity.due_time) {
          const datePart = activity.due_date.split('T')[0];
          const parts = activity.due_time.split(':');
          const hours = parts[0]?.padStart(2, '0') || '00';
          const minutes = parts[1]?.padStart(2, '0') || '00';
          const seconds = parts[2]?.padStart(2, '0') || '00';
          const normalizedTime = `${hours}:${minutes}:${seconds}`;

          const offsetMinutes = getCurrentTimezoneOffset(selectedTimezone);
          const utcString = `${datePart}T${normalizedTime}.000Z`;
          const localDate = utcToLocal(utcString, offsetMinutes);

          if (isNaN(localDate.getTime())) {
            if (import.meta.env.DEV)
              console.warn('[Activities] Invalid Date from UTC conversion:', utcString);
            return activity.due_date;
          }
          return format(localDate, 'MMM d, yyyy, h:mm a');
        } else {
          // Date-only
          const parts = activity.due_date.split('-').map(Number);
          if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
            return activity.due_date;
          }
          const localCalendarDate = new Date(parts[0], parts[1] - 1, parts[2]);
          if (isNaN(localCalendarDate.getTime())) return activity.due_date;
          return format(localCalendarDate, 'MMM d, yyyy');
        }
      } catch (error) {
        console.error('Error formatting date:', error);
        return activity.due_date;
      }
    },
    [selectedTimezone],
  );

  // AiSHA events listener
  useAiShaEvents({
    entityType: 'activities',
    onOpenEdit: ({ id }) => {
      const activity = activities.find((a) => a.id === id);
      if (activity) {
        setEditingActivity(activity);
        setIsFormOpen(true);
      } else {
        Activity.filter({ id }).then((filterResult) => {
          const activityList = Array.isArray(filterResult)
            ? filterResult
            : filterResult?.activities || [];
          if (activityList.length > 0) {
            setEditingActivity(activityList[0]);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      const activity = activities.find((a) => a.id === id);
      if (activity) {
        setDetailActivity(activity);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingActivity(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  // --- Render ---

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
        <SimpleModal
          open={isFormOpen}
          onOpenChange={(open) => {
            setIsFormOpen(open);
            if (!open) setEditingActivity(null);
          }}
          title={editingActivity ? `Edit ${activityLabel}` : `Add New ${activityLabel}`}
          size="lg"
        >
          <ActivityForm
            activity={editingActivity}
            accounts={accounts}
            contacts={contacts}
            leads={leads}
            opportunities={opportunities}
            users={users}
            tenantId={user?.tenant_id || selectedTenantId}
            user={user}
            onSave={handleSave}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingActivity(null);
            }}
          />
        </SimpleModal>

        <CsvImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          schema={Activity.schema ? Activity.schema() : null}
          onSuccess={async () => {
            clearCache('');
            await loadActivities(1, pageSize);
          }}
        />

        {isDetailOpen && detailActivity && (
          <ActivityDetailPanel
            activity={detailActivity}
            accounts={accounts}
            contacts={contacts}
            leads={leads}
            opportunities={opportunities}
            users={users}
            assignedUserName={(() => {
              if (!detailActivity.assigned_to) return undefined;
              return (
                employeesMap[detailActivity.assigned_to] ||
                usersMap[detailActivity.assigned_to] ||
                detailActivity.assigned_to_name ||
                detailActivity.assigned_to
              );
            })()}
            relatedName={detailActivity.related_name}
            open={isDetailOpen}
            onOpenChange={() => {
              setIsDetailOpen(false);
              setDetailActivity(null);
            }}
            onEdit={(activity) => {
              setEditingActivity(activity);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            user={user}
          />
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">{activitiesLabel}</h1>
            <p className="text-slate-400">
              Track and manage your team&apos;s {activitiesLabel.toLowerCase()} and tasks
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === 'list' ? (
                    <List className="w-4 h-4" />
                  ) : (
                    <Grid className="w-4 h-4" />
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
                <p>Import activities from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton entityName="Activity" data={activities} filename="activities_export" />
            {(selectedActivities.size > 0 || selectAllMode) && (
              <BulkActionsMenu
                selectedCount={selectAllMode ? totalItems : selectedActivities.size}
                onBulkStatusChange={handleBulkStatusChange}
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
                    setEditingActivity(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add {activityLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {activityLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <ActivityStatsCards
          totalStats={totalStats}
          statusFilter={statusFilter}
          onStatusFilterClick={handleStatusFilterClick}
          activitiesLabel={activitiesLabel}
          isCardVisible={isCardVisible}
          getCardLabel={getCardLabel}
        />

        {/* Filters */}
        <ActivityFilters
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

        {/* Select All Banners */}
        {selectedActivities.size === activities.length &&
          activities.length > 0 &&
          !selectAllMode &&
          totalItems > activities.length && (
            <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-400" />
                <span className="text-blue-200">
                  All {activities.length} activities on this page are selected.
                </span>
                <Button
                  variant="link"
                  onClick={handleSelectAllRecords}
                  className="text-blue-400 hover:text-blue-300 p-0 h-auto"
                >
                  Select all {totalItems} activities matching current filters
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
          <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200 font-semibold">
                All {totalItems} activities matching current filters are selected.
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
              <p className="text-slate-400">Loading activities...</p>
            </div>
          </div>
        ) : activities.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">
              No {activitiesLabel.toLowerCase()} found
            </h3>
            <p className="text-slate-500 mb-6">
              {hasActiveFilters
                ? 'Try adjusting your filters or search term'
                : `Get started by adding your first ${activityLabel.toLowerCase()}`}
            </p>
            {!hasActiveFilters && (
              <Button onClick={() => setIsFormOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Your First {activityLabel}
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    assignedUserName={(() => {
                      if (!activity.assigned_to) return undefined;
                      return (
                        employeesMap[activity.assigned_to] ||
                        usersMap[activity.assigned_to] ||
                        activity.assigned_to_name ||
                        activity.assigned_to
                      );
                    })()}
                    relatedName={activity.related_name}
                    onEdit={() => {
                      setEditingActivity(activity);
                      setIsFormOpen(true);
                    }}
                    onDelete={() => handleDelete(activity.id)}
                    onViewDetails={() => handleViewDetails(activity)}
                    isSelected={selectedActivities.has(activity.id)}
                    onSelect={() => toggleSelection(activity.id)}
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
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                handlePageSizeChange(newSize);
              }}
              loading={loading}
            />
          </>
        ) : (
          <>
            <ActivityTable
              activities={activities}
              selectedActivities={selectedActivities}
              selectAllMode={selectAllMode}
              toggleSelectAll={toggleSelectAll}
              toggleSelection={toggleSelection}
              employeesMap={employeesMap}
              usersMap={usersMap}
              handleViewDetails={handleViewDetails}
              setEditingActivity={setEditingActivity}
              setIsFormOpen={setIsFormOpen}
              handleDelete={handleDelete}
              activityLabel={activityLabel}
              formatDisplayDate={formatDisplayDate}
              getRelatedEntityLink={getRelatedEntityLink}
              deletingId={deletingId}
              updatingId={updatingId}
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

      {/* Related entity detail panels */}
      {relatedEntityType === 'contact' && (
        <ContactDetailPanel
          contact={viewingRelatedEntity}
          open={isRelatedDetailOpen}
          onOpenChange={(open) => {
            setIsRelatedDetailOpen(open);
            if (!open) {
              setViewingRelatedEntity(null);
              setRelatedEntityType(null);
            }
          }}
          user={user}
        />
      )}
      {relatedEntityType === 'account' && (
        <AccountDetailPanel
          account={viewingRelatedEntity}
          open={isRelatedDetailOpen}
          onOpenChange={(open) => {
            setIsRelatedDetailOpen(open);
            if (!open) {
              setViewingRelatedEntity(null);
              setRelatedEntityType(null);
            }
          }}
          user={user}
        />
      )}
      {relatedEntityType === 'lead' && (
        <LeadDetailPanel
          lead={viewingRelatedEntity}
          open={isRelatedDetailOpen}
          onOpenChange={(open) => {
            setIsRelatedDetailOpen(open);
            if (!open) {
              setViewingRelatedEntity(null);
              setRelatedEntityType(null);
            }
          }}
          user={user}
        />
      )}
      {relatedEntityType === 'opportunity' && isRelatedDetailOpen && viewingRelatedEntity && (
        <OpportunityDetailPanel
          opportunity={viewingRelatedEntity}
          onClose={() => {
            setIsRelatedDetailOpen(false);
            setViewingRelatedEntity(null);
            setRelatedEntityType(null);
          }}
          user={user}
        />
      )}

      <ConfirmDialogPortal />
    </TooltipProvider>
  );
}
