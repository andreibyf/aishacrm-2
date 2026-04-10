import { useEffect, useMemo, useState } from 'react';
import { Contact, Account } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';
import { useApiManager } from '../components/shared/ApiManager';
import { useProgress } from '@/components/shared/ProgressOverlay';
import ContactCard from '../components/contacts/ContactCard';
import ContactForm from '../components/contacts/ContactForm';
import ContactDetailPanel from '../components/contacts/ContactDetailPanel';
import AccountDetailPanel from '../components/accounts/AccountDetailPanel';
import ContactStatsCards from '../components/contacts/ContactStatsCards';
import ContactFilters from '../components/contacts/ContactFilters';
import ContactTable from '../components/contacts/ContactTable';
import BulkActionsMenu from '../components/contacts/BulkActionsMenu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle, Grid, List, Loader2, Plus, Upload, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import CsvExportButton from '../components/shared/CsvExportButton';
import CsvImportDialog from '../components/shared/CsvImportDialog';
import { useTenant } from '../components/shared/tenantContext';
import Pagination from '../components/shared/Pagination';
import { toast } from 'sonner';
import ContactToLeadDialog from '../components/contacts/ContactToLeadDialog';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import RefreshButton from '../components/shared/RefreshButton';
import { useLoadingToast } from '@/hooks/useLoadingToast';
import { useLogger } from '../components/shared/Logger';
import { useConfirmDialog } from '../components/shared/ConfirmDialog';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { useAiShaEvents } from '@/hooks/useAiShaEvents';
import { useContactsData } from '@/hooks/useContactsData';
import { useContactsBulkOps } from '@/hooks/useContactsBulkOps';
import { runMutationRefresh } from '@/utils/mutationRefresh';

export default function ContactsPage() {
  const { plural: contactsLabel, singular: contactLabel } = useEntityLabel('contacts');
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();
  const loadingToast = useLoadingToast();
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const { selectedEmail } = useEmployeeScope();
  const { cachedRequest, clearCache, clearCacheByKey } = useApiManager();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();
  const logger = useLogger();

  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [viewMode, setViewMode] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'grid' : 'list',
  );
  const [selectedContacts, setSelectedContacts] = useState(() => new Set());
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
  const [convertingContact, setConvertingContact] = useState(null);

  // Account detail panel (opened from company links)
  const [viewingAccount, setViewingAccount] = useState(null);
  const [isAccountDetailOpen, setIsAccountDetailOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  // Sort options
  const sortOptions = useMemo(
    () => [
      { label: 'Newest First', field: 'created_at', direction: 'desc' },
      { label: 'Oldest First', field: 'created_at', direction: 'asc' },
      { label: 'Last Updated', field: 'updated_at', direction: 'desc' },
      { label: 'Name A-Z', field: 'first_name', direction: 'asc' },
      { label: 'Name Z-A', field: 'first_name', direction: 'desc' },
    ],
    [],
  );

  // Data hook
  const {
    contacts,
    setContacts,
    accounts,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadContacts,
    loadTotalStats,
    getTenantFilter,
    refreshAccounts,
    accountMap,
    userMap,
    employeeMap,
    initialLoadDone,
    detailContact,
    setDetailContact,
    isDetailOpen,
    setIsDetailOpen,
    handlePageChange,
    handlePageSizeChange,
  } = useContactsData({
    selectedTenantId,
    employeeScope: selectedEmail,
    statusFilter,
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
    contactsLabel,
    cachedRequest,
    clearCacheByKey,
    setCurrentPage,
    logger,
  });

  // Bulk ops hook
  const { handleBulkDelete, handleBulkStatusChange, handleBulkAssign } = useContactsBulkOps({
    contacts,
    selectedContacts,
    setSelectedContacts,
    selectAllMode,
    setSelectAllMode,
    totalItems,
    getTenantFilter,
    searchTerm,
    statusFilter,
    selectedTags,
    sortField,
    sortDirection,
    loadContacts,
    loadTotalStats,
    startProgress,
    updateProgress,
    completeProgress,
    clearCacheByKey,
    setContacts,
    setTotalItems,
    confirm,
    contactsLabel,
    logger,
    user,
  });

  // --- Local handlers ---

  const handleCreate = async (result) => {
    const tenantIdentifier = user?.tenant_id || selectedTenantId;
    logger.info('Contact created by form', 'ContactsPage', {
      contactId: result?.id,
      contactName: `${result?.first_name} ${result?.last_name}`,
      tenantId: tenantIdentifier,
    });
    // Close form immediately
    setIsFormOpen(false);
    setEditingContact(null);
    try {
      setCurrentPage(1);
      clearCacheByKey('Contact');
      await runMutationRefresh(
        () => Promise.all([loadContacts(), loadTotalStats(), refreshAccounts()]),
        { passes: 3, initialDelayMs: 80, stepDelayMs: 160 },
      );
    } catch (error) {
      console.error('[Contacts] Error in handleCreate:', error);
    }
  };

  const handleUpdate = async (result) => {
    const savedId = result?.id || null;

    // Close form immediately — don't make user wait for background reload
    setIsFormOpen(false);
    setEditingContact(null);

    // Optimistic update: patch the contact in-place so the list shows new data instantly
    if (savedId) {
      const emp = employeeMap.get(result.assigned_to);
      const empName = emp ? `${emp.first_name} ${emp.last_name}` : null;
      setContacts((prev) =>
        prev.map((c) =>
          c.id === savedId
            ? {
                ...c,
                ...result,
                assigned_to_name: empName || result.assigned_to_name || c.assigned_to_name,
              }
            : c,
        ),
      );
    }

    logger.info('Contact updated by form', 'ContactsPage', {
      contactId: result?.id,
      contactName: `${result?.first_name} ${result?.last_name}`,
    });

    // Background reload — show "Updating..." on the row while this runs
    if (savedId) setUpdatingId(savedId);
    try {
      clearCache('Contact');
      clearCacheByKey('Contact');
      await runMutationRefresh(
        () => Promise.all([loadContacts(), loadTotalStats(), refreshAccounts()]),
        { passes: 3, initialDelayMs: 80, stepDelayMs: 160 },
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete contact?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await Contact.delete(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setTotalItems((prev) => Math.max(0, prev - 1));
      toast.success('Contact deleted successfully');
      clearCacheByKey('Contact');
      await runMutationRefresh(() => Promise.all([loadContacts(), loadTotalStats()]), {
        passes: 3,
        initialDelayMs: 80,
        stepDelayMs: 160,
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error('Failed to delete contact');
      loadContacts();
      loadTotalStats();
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectContact = (contactId, checked) => {
    setSelectedContacts((prev) => {
      const newSet = new Set(prev);
      if (checked) newSet.add(contactId);
      else newSet.delete(contactId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedContacts.size === contacts.length && contacts.length > 0) {
      setSelectedContacts(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedContacts(new Set(contacts.map((c) => c.id)));
  };

  const handleClearSelection = () => {
    setSelectedContacts(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (contact) => {
    setDetailContact(contact);
    setIsDetailOpen(true);
  };

  const handleViewAccount = async (accountId, _accountName) => {
    try {
      const accountData = await Account.get(accountId);
      setViewingAccount(accountData);
      setIsAccountDetailOpen(true);
    } catch (error) {
      console.error('Failed to load account:', error);
      toast.error('Could not load account details');
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
  };

  const handleRefresh = () => {
    clearCacheByKey('Contact');
    clearCacheByKey('Account');
    clearCacheByKey('Employee');
    loadContacts();
    loadTotalStats();
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedTags([]);
    setAssignedToFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = useMemo(
    () => searchTerm !== '' || selectedTags.length > 0 || assignedToFilter !== 'all',
    [searchTerm, selectedTags, assignedToFilter],
  );

  // AiSHA events
  useAiShaEvents({
    entityType: 'contacts',
    onOpenEdit: ({ id }) => {
      const contact = contacts.find((c) => c.id === id);
      if (contact) {
        setEditingContact(contact);
        setIsFormOpen(true);
      } else {
        Contact.get(id).then((result) => {
          if (result) {
            setEditingContact(result);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      const contact = contacts.find((c) => c.id === id);
      if (contact) {
        setDetailContact(contact);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingContact(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  // --- Render ---

  if (loading && !initialLoadDone.current) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">{contactsLabel}</h1>
          <p className="text-slate-400 mt-1">
            Track and manage your sales {contactsLabel.toLowerCase()} and prospects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton onClick={handleRefresh} loading={loading} />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </Button>
          <CsvExportButton
            entityName="Contact"
            data={contacts}
            filename="contacts"
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          />
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          {(selectedContacts.size > 0 || selectAllMode) && (
            <BulkActionsMenu
              selectedCount={selectAllMode ? totalItems : selectedContacts.size}
              onBulkDelete={handleBulkDelete}
              onBulkStatusChange={handleBulkStatusChange}
              onBulkAssign={handleBulkAssign}
              employees={employees}
              selectAllMode={selectAllMode}
              totalCount={totalItems}
            />
          )}
          <Button
            onClick={() => {
              setEditingContact(null);
              setIsFormOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add {contactLabel}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <ContactStatsCards
        totalStats={totalStats}
        statusFilter={statusFilter}
        onStatusFilterClick={handleStatusFilterClick}
        contactsLabel={contactsLabel}
        isCardVisible={isCardVisible}
        getCardLabel={getCardLabel}
      />

      {/* Filters */}
      <ContactFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
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
      {selectedContacts.size === contacts.length &&
        contacts.length > 0 &&
        !selectAllMode &&
        totalItems > contacts.length && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {contacts.length} {contactsLabel.toLowerCase()} on this page are selected.
              </span>
              <Button
                variant="link"
                onClick={handleSelectAllRecords}
                className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              >
                Select all {totalItems} {contactsLabel.toLowerCase()} matching current filters
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
              All {totalItems} {contactsLabel.toLowerCase()} matching current filters are selected.
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
      {viewMode === 'list' ? (
        <ContactTable
          contacts={contacts}
          selectedContacts={selectedContacts}
          selectAllMode={selectAllMode}
          toggleSelectAll={toggleSelectAll}
          handleSelectContact={handleSelectContact}
          accountMap={accountMap}
          userMap={userMap}
          employeeMap={employeeMap}
          handleViewDetails={handleViewDetails}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
          handleViewAccount={handleViewAccount}
          user={user}
          deletingId={deletingId}
          updatingId={updatingId}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {contacts.map((contact) => {
              const account = accountMap.get(contact.account_id);
              const assignedUser = userMap.get(contact.assigned_to);
              const assignedEmployee = employeeMap.get(contact.assigned_to);
              const assignedName =
                assignedEmployee?.first_name && assignedEmployee?.last_name
                  ? `${assignedEmployee.first_name} ${assignedEmployee.last_name}`
                  : assignedUser?.full_name || contact.assigned_to_name || null;

              return (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  accountId={contact.account_id}
                  accountName={account?.name || contact.account_name}
                  assignedUserName={assignedName}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewDetails={handleViewDetails}
                  onViewAccount={handleViewAccount}
                  onClick={() => handleViewDetails(contact)}
                  isSelected={selectedContacts.has(contact.id) || selectAllMode}
                  onSelect={(checked) => handleSelectContact(contact.id, checked)}
                  user={user}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalItems / pageSize)}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={handlePageChange}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          handlePageSizeChange(newSize);
        }}
      />

      {/* Empty State */}
      {!loading && contacts.length === 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
          <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-300 mb-2">
            No {contactsLabel.toLowerCase()} found
          </h3>
          <p className="text-slate-500 mb-6">
            {searchTerm || statusFilter !== 'all' || selectedTags.length > 0
              ? 'Try adjusting your filters'
              : `Get started by creating your first ${contactLabel.toLowerCase()}`}
          </p>
          {!searchTerm && statusFilter === 'all' && selectedTags.length === 0 && (
            <Button
              onClick={() => {
                setEditingContact(null);
                setIsFormOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First {contactLabel}
            </Button>
          )}
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingContact ? `Edit ${contactLabel}` : `Create New ${contactLabel}`}
            </DialogTitle>
          </DialogHeader>
          <ContactForm
            contact={editingContact}
            accounts={accounts}
            users={users}
            employees={employees}
            user={user}
            onSuccess={editingContact ? handleUpdate : handleCreate}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingContact(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <ContactDetailPanel
        contact={detailContact}
        accountId={detailContact?.account_id}
        accountName={accountMap.get(detailContact?.account_id)?.name || detailContact?.account_name}
        assignedUserName={
          detailContact
            ? employeeMap.get(detailContact.assigned_to)?.first_name &&
              employeeMap.get(detailContact.assigned_to)?.last_name
              ? `${employeeMap.get(detailContact.assigned_to).first_name} ${employeeMap.get(detailContact.assigned_to).last_name}`
              : userMap.get(detailContact.assigned_to)?.full_name ||
                detailContact.assigned_to_name ||
                null
            : null
        }
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) setDetailContact(null);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        user={user}
      />

      <CsvImportDialog
        entityName="Contact"
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => {
          clearCacheByKey('Contact');
          loadContacts();
          loadTotalStats();
        }}
      />

      {convertingContact && (
        <ContactToLeadDialog
          contact={convertingContact}
          open={!!convertingContact}
          onOpenChange={(open) => !open && setConvertingContact(null)}
          onSuccess={() => {
            setConvertingContact(null);
            toast.success('Contact converted to lead successfully');
          }}
        />
      )}

      <AccountDetailPanel
        account={viewingAccount}
        open={isAccountDetailOpen}
        onOpenChange={(open) => {
          setIsAccountDetailOpen(open);
          if (!open) setViewingAccount(null);
        }}
        user={user}
      />

      <ConfirmDialogPortal />
    </div>
  );
}
