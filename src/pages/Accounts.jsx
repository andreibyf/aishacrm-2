import { useEffect, useMemo, useState } from 'react';
import { Account } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';
import { useApiManager } from '../components/shared/ApiManager';
import { useConfirmDialog } from '../components/shared/ConfirmDialog';
import { useProgress } from '@/components/shared/ProgressOverlay';
import AccountCard from '../components/accounts/AccountCard';
import AccountForm from '../components/accounts/AccountForm';
import AccountDetailPanel from '../components/accounts/AccountDetailPanel';
import AccountStatsCards from '../components/accounts/AccountStatsCards';
import AccountFilters from '../components/accounts/AccountFilters';
import AccountTable from '../components/accounts/AccountTable';
import BulkActionsMenu from '../components/accounts/BulkActionsMenu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, Grid, List, Loader2, Plus, Upload, X } from 'lucide-react';
import CsvExportButton from '../components/shared/CsvExportButton';
import CsvImportDialog from '../components/shared/CsvImportDialog';
import { useTenant } from '../components/shared/tenantContext';
import Pagination from '../components/shared/Pagination';
import { toast } from 'sonner';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import { useLoadingToast } from '@/hooks/useLoadingToast';
import RefreshButton from '../components/shared/RefreshButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { useAiShaEvents } from '@/hooks/useAiShaEvents';
import { useAccountsData } from '@/hooks/useAccountsData';
import { useAccountsBulkOps } from '@/hooks/useAccountsBulkOps';
import { runMutationRefresh } from '@/utils/mutationRefresh';

export default function AccountsPage() {
  const { plural: accountsLabel, singular: accountLabel } = useEntityLabel('accounts');
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const { selectedEmail } = useEmployeeScope();
  const { cachedRequest, clearCache, clearCacheByKey } = useApiManager();
  const loadingToast = useLoadingToast();

  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'grid' : 'list',
  );
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Auto-switch to card view on mobile screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e) => setViewMode(e.matches ? 'grid' : 'list');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [selectedTags, setSelectedTags] = useState([]);
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [showTestData] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // Sort options
  const sortOptions = useMemo(
    () => [
      { label: 'Newest First', field: 'created_at', direction: 'desc' },
      { label: 'Oldest First', field: 'created_at', direction: 'asc' },
      { label: 'Last Updated', field: 'updated_at', direction: 'desc' },
      { label: 'Name A-Z', field: 'name', direction: 'asc' },
      { label: 'Name Z-A', field: 'name', direction: 'desc' },
    ],
    [],
  );

  // Data hook
  const {
    accounts,
    setAccounts,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadAccounts,
    loadTotalStats,
    getTenantFilter,
    assignedToMap,
    initialLoadDone,
    detailAccount,
    setDetailAccount,
    isDetailOpen,
    setIsDetailOpen,
    handlePageChange,
    handlePageSizeChange,
    reloadSupportingData,
  } = useAccountsData({
    selectedTenantId,
    employeeScope: selectedEmail,
    typeFilter,
    assignedToFilter,
    searchTerm,
    sortField,
    sortDirection,
    selectedTags,
    showTestData,
    currentPage,
    pageSize,
    user,
    loadingToast,
    accountsLabel,
    cachedRequest,
    clearCache,
    clearCacheByKey,
    setCurrentPage,
  });

  // Bulk ops hook
  const { handleBulkDelete, handleBulkTypeChange, handleBulkAssign } = useAccountsBulkOps({
    accounts,
    selectedAccounts,
    setSelectedAccounts,
    selectAllMode,
    setSelectAllMode,
    totalItems,
    getTenantFilter,
    searchTerm,
    typeFilter,
    selectedTags,
    sortField,
    sortDirection,
    loadAccounts,
    loadTotalStats,
    startProgress,
    updateProgress,
    completeProgress,
    clearCacheByKey,
    confirm,
    user,
  });

  // --- Local handlers ---

  const handleSave = async (result = null) => {
    const wasEditing = !!editingAccount;
    const editingId = editingAccount?.id || null;

    // Close form immediately — don't make user wait for background reload
    setIsFormOpen(false);
    setEditingAccount(null);

    // Optimistic update: patch the account in-place so the list shows new data instantly
    if (wasEditing && editingId && result) {
      setAccounts((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...result } : a)));
    }

    if (wasEditing && editingId) setUpdatingId(editingId);
    try {
      clearCache('Account');
      clearCacheByKey('Account');
      await runMutationRefresh(() => Promise.all([loadAccounts(), loadTotalStats()]), {
        passes: 3,
        initialDelayMs: 80,
        stepDelayMs: 160,
      });
      toast.success(wasEditing ? 'Account updated successfully' : 'Account created successfully');
    } catch (error) {
      console.error('[Accounts] Error in handleSave:', error);
      toast.error('Failed to refresh account list');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete account?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await Account.delete(id);
      clearCacheByKey('Account');

      // Wait for refresh to confirm deletion before removing "Deleting..." indicator
      await runMutationRefresh(() => Promise.all([loadAccounts(), loadTotalStats()]), {
        passes: 3,
        initialDelayMs: 80,
        stepDelayMs: 160,
      });

      toast.success('Account deleted successfully');
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete account:', error);
      const errorMsg =
        error?.response?.status === 404 ? 'Account already deleted' : 'Failed to delete account';
      toast.error(errorMsg);
      await loadAccounts();
      await loadTotalStats();
      setDeletingId(null);
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedAccounts);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedAccounts(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedAccounts.size === accounts.length && accounts.length > 0) {
      setSelectedAccounts(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedAccounts(new Set(accounts.map((a) => a.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedAccounts(new Set(accounts.map((a) => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedAccounts(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (account) => {
    setDetailAccount(account);
    setIsDetailOpen(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setIsFormOpen(true);
  };

  const handleRefresh = async () => {
    clearCacheByKey('Account');
    clearCacheByKey('Employee');
    clearCacheByKey('User');
    clearCacheByKey('Contact');
    await reloadSupportingData();
    await Promise.all([loadAccounts(), loadTotalStats()]);
    toast.success('Accounts refreshed');
  };

  const handleTypeFilterClick = (type) => {
    setTypeFilter(type);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setAssignedToFilter('all');
    setSelectedTags([]);
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(
    () =>
      searchTerm !== '' ||
      typeFilter !== 'all' ||
      assignedToFilter !== 'all' ||
      selectedTags.length > 0,
    [searchTerm, typeFilter, assignedToFilter, selectedTags],
  );

  // Extract tags from current page for TagFilter
  const allTags = useMemo(() => {
    if (!Array.isArray(accounts)) return [];
    const tagCounts = {};
    accounts.forEach((account) => {
      if (Array.isArray(account.tags)) {
        account.tags.forEach((tag) => {
          if (tag && typeof tag === 'string') {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [accounts]);

  // AiSHA events
  useAiShaEvents({
    entityType: 'accounts',
    onOpenEdit: ({ id }) => {
      const account = accounts.find((a) => a.id === id);
      if (account) {
        setEditingAccount(account);
        setIsFormOpen(true);
      } else {
        Account.get(id).then((result) => {
          if (result) {
            setEditingAccount(result);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      const account = accounts.find((a) => a.id === id);
      if (account) {
        setDetailAccount(account);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingAccount(null);
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
    <>
      <TooltipProvider>
        <div className="space-y-6">
          {/* Dialogs */}
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
              <DialogHeader>
                <DialogTitle className="text-slate-100">
                  {editingAccount ? `Edit ${accountLabel}` : `Add New ${accountLabel}`}
                </DialogTitle>
              </DialogHeader>
              <AccountForm
                account={editingAccount}
                onSubmit={async (result) => {
                  await handleSave(result);
                }}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingAccount(null);
                }}
                user={user}
              />
            </DialogContent>
          </Dialog>

          <CsvImportDialog
            open={isImportOpen}
            onOpenChange={setIsImportOpen}
            schema={Account.schema ? Account.schema() : null}
            onSuccess={async () => {
              clearCacheByKey('Account');
              await Promise.all([loadAccounts(), loadTotalStats()]);
            }}
          />

          <AccountDetailPanel
            account={detailAccount}
            assignedUserName={
              assignedToMap[detailAccount?.assigned_to] || detailAccount?.assigned_to
            }
            open={isDetailOpen}
            onOpenChange={() => {
              setIsDetailOpen(false);
              setDetailAccount(null);
            }}
            onEdit={(account) => {
              setEditingAccount(account);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            onRefresh={() => loadAccounts()}
            user={user}
          />

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-slate-100">{accountsLabel}</h1>
              </div>
              <p className="text-slate-400 mt-1">
                Manage your company {accountsLabel.toLowerCase()} and partnerships.
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
                  <p>Import accounts from CSV</p>
                </TooltipContent>
              </Tooltip>
              <CsvExportButton entityName="Account" data={accounts} filename="accounts_export" />
              {(selectedAccounts.size > 0 || selectAllMode) && (
                <BulkActionsMenu
                  selectedCount={selectAllMode ? totalItems : selectedAccounts.size}
                  onBulkTypeChange={handleBulkTypeChange}
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
                      setEditingAccount(null);
                      setIsFormOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add {accountLabel}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Create new {accountLabel.toLowerCase()}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Stats Cards */}
          <AccountStatsCards
            totalStats={totalStats}
            typeFilter={typeFilter}
            onTypeFilterClick={handleTypeFilterClick}
            accountsLabel={accountsLabel}
            isCardVisible={isCardVisible}
            getCardLabel={getCardLabel}
          />

          {/* Filters */}
          <AccountFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            allTags={allTags}
            employees={employees}
            assignedToFilter={assignedToFilter}
            setAssignedToFilter={setAssignedToFilter}
            sortField={sortField}
            sortDirection={sortDirection}
            setSortField={setSortField}
            setSortDirection={setSortDirection}
            sortOptions={sortOptions}
            setCurrentPage={setCurrentPage}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={handleClearFilters}
          />

          {/* Select All Banners */}
          {selectedAccounts.size === accounts.length &&
            accounts.length > 0 &&
            !selectAllMode &&
            totalItems > accounts.length && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-400" />
                  <span className="text-blue-200">
                    All {accounts.length} accounts on this page are selected.
                  </span>
                  <Button
                    variant="link"
                    onClick={handleSelectAllRecords}
                    className="text-blue-400 hover:text-blue-300 p-0 h-auto"
                  >
                    Select all {totalItems} accounts matching current filters
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
                  All {totalItems} accounts matching current filters are selected.
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
                <p className="text-slate-400">Loading accounts...</p>
              </div>
            </div>
          ) : accounts.length === 0 ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">
                No {accountsLabel.toLowerCase()} found
              </h3>
              <p className="text-slate-500 mb-6">
                {hasActiveFilters
                  ? 'Try adjusting your filters or search term'
                  : `Get started by adding your first ${accountLabel.toLowerCase()}`}
              </p>
              {!hasActiveFilters && (
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First {accountLabel}
                </Button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <>
              <AccountTable
                accounts={accounts}
                selectedAccounts={selectedAccounts}
                selectAllMode={selectAllMode}
                toggleSelectAll={toggleSelectAll}
                toggleSelection={toggleSelection}
                assignedToMap={assignedToMap}
                handleViewDetails={handleViewDetails}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
                accountLabel={accountLabel}
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
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {accounts.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    assignedUserName={assignedToMap[account.assigned_to] || account.assigned_to}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onViewDetails={handleViewDetails}
                    onClick={() => handleViewDetails(account)}
                    isSelected={selectedAccounts.has(account.id) || selectAllMode}
                    onSelect={() => toggleSelection(account.id)}
                    user={user}
                  />
                ))}
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
          )}
        </div>
      </TooltipProvider>
      {ConfirmDialogPortal}
    </>
  );
}
