import { Contact } from '@/api/entities';
import { toast } from 'sonner';

/**
 * useContactsBulkOps hook - Manages bulk operations for contacts
 *
 * Handles:
 * - Bulk delete (with select-all mode)
 * - Bulk status change
 * - Bulk assign
 *
 * Uses confirm dialog (not window.confirm) for destructive operations.
 * For select-all mode, fetches all matching contacts server-side before operating.
 */
export function useContactsBulkOps({
  contacts: _contacts,
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
  setContacts: _setContacts,
  setTotalItems: _setTotalItems,
  confirm,
  contactsLabel,
  logger,
  user,
}) {
  // Helper: fetch all matching contacts for select-all operations
  // Uses the same server-side filtering semantics as loadContacts
  const fetchAllMatching = async () => {
    const scopedFilter = getTenantFilter();

    // Apply server-side status filter
    if (statusFilter !== 'all') {
      scopedFilter.status = statusFilter;
    }

    // Merge scope $or and search $or into filter param (mirrors loadContacts)
    if (scopedFilter.$or || searchTerm) {
      let filterObj = {};
      const clauses = [];
      if (scopedFilter.$or) clauses.push({ $or: scopedFilter.$or });
      if (searchTerm) {
        const s = searchTerm.trim();
        clauses.push({
          $or: [
            { first_name: { $icontains: s } },
            { last_name: { $icontains: s } },
            { email: { $icontains: s } },
            { phone: { $icontains: s } },
            { company: { $icontains: s } },
            { job_title: { $icontains: s } },
          ],
        });
      }
      if (clauses.length === 1) {
        filterObj.$or = clauses[0].$or;
      } else {
        filterObj.$and = clauses;
      }
      scopedFilter.filter = JSON.stringify(filterObj);
      delete scopedFilter.$or;
    }

    const filterWithLimit = { ...scopedFilter, limit: 10000 };
    const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
    const allContacts = await Contact.filter(filterWithLimit, sortString);

    let filtered = allContacts || [];
    // Tags require client-side filtering
    if (selectedTags.length > 0) {
      filtered = filtered.filter(
        (c) => Array.isArray(c.tags) && selectedTags.every((tag) => c.tags.includes(tag)),
      );
    }
    return filtered;
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: `Delete all ${contactsLabel.toLowerCase()}?`,
        description: `Delete ALL ${totalItems} ${contactsLabel.toLowerCase()} matching current filters? This cannot be undone!`,
        variant: 'destructive',
        confirmText: 'Delete All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        startProgress({ message: 'Fetching contacts to delete...' });
        const filtered = await fetchAllMatching();
        const deleteCount = filtered.length;

        updateProgress({ message: `Deleting ${deleteCount} contacts...`, total: deleteCount, current: 0 });

        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((c) => Contact.delete(c.id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
          updateProgress({ current: successCount + failCount, message: `Deleted ${successCount} of ${deleteCount} contacts...` });
        }

        completeProgress();
        setSelectedContacts(new Set());
        setSelectAllMode(false);
        clearCacheByKey('Contact');
        await Promise.all([loadContacts(), loadTotalStats()]);
        if (successCount > 0) toast.success(`${successCount} contact(s) deleted`);
        if (failCount > 0) toast.error(`${failCount} contact(s) failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to bulk delete contacts:', error);
        toast.error('Failed to delete contacts');
      }
      return;
    }

    // Selected items mode
    const count = selectedContacts.size;
    const confirmed = await confirm({
      title: `Delete ${count} contact${count !== 1 ? 's' : ''}?`,
      description: `This will permanently delete ${count} contact${count !== 1 ? 's' : ''}. This action cannot be undone.`,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    const contactIds = Array.from(selectedContacts);
    startProgress({ message: `Deleting ${contactIds.length} contacts...`, total: contactIds.length });

    try {
      let successCount = 0;
      let failCount = 0;
      const BATCH_SIZE = 50;

      for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
        const batch = contactIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((id) => Contact.delete(id)));
        results.forEach((r) => {
          if (r.status === 'fulfilled') successCount++;
          else {
            const is404 = r.reason?.response?.status === 404;
            if (!is404) failCount++;
          }
        });
        updateProgress({ current: Math.min(i + BATCH_SIZE, contactIds.length), message: `Deleted ${successCount} of ${contactIds.length} contacts...` });
      }

      completeProgress();
      setSelectedContacts(new Set());
      clearCacheByKey('Contact');
      await Promise.all([loadContacts(), loadTotalStats()]);

      if (successCount > 0) toast.success(`Successfully deleted ${successCount} contact${successCount !== 1 ? 's' : ''}`);
      if (failCount > 0) toast.error(`Failed to delete ${failCount} contact${failCount !== 1 ? 's' : ''}`);
    } catch (error) {
      completeProgress();
      console.error('Failed to bulk delete contacts:', error);
      toast.error('Failed to delete contacts');
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    let contactIds;
    if (selectAllMode) {
      const filtered = await fetchAllMatching();
      contactIds = filtered.map((c) => c.id);
    } else {
      contactIds = Array.from(selectedContacts);
    }

    const count = contactIds.length;
    logger.info('Attempting to bulk update contact status', 'ContactsPage', {
      count,
      newStatus,
      userId: user?.id || user?.email,
    });

    let successCount = 0;
    let failCount = 0;

    for (const id of contactIds) {
      try {
        await Contact.update(id, { status: newStatus });
        successCount++;
      } catch (error) {
        console.error(`Error updating contact ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) toast.success(`Successfully updated ${successCount} contact${successCount !== 1 ? 's' : ''}`);
    if (failCount > 0) toast.error(`Failed to update ${failCount} contact${failCount !== 1 ? 's' : ''}`);

    setSelectedContacts(new Set());
    setSelectAllMode(false);
    clearCacheByKey('Contact');
    loadContacts();
    loadTotalStats();
  };

  const handleBulkAssign = async (assigneeId) => {
    let contactIds;
    if (selectAllMode) {
      const filtered = await fetchAllMatching();
      contactIds = filtered.map((c) => c.id);
    } else {
      contactIds = Array.from(selectedContacts);
    }

    const count = contactIds.length;
    logger.info('Attempting to bulk assign contacts', 'ContactsPage', {
      count,
      assigneeId,
      userId: user?.id || user?.email,
    });

    let successCount = 0;
    let failCount = 0;

    for (const id of contactIds) {
      try {
        await Contact.update(id, { assigned_to: assigneeId || null });
        successCount++;
      } catch (error) {
        console.error(`Error assigning contact ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) toast.success(`Successfully assigned ${successCount} contact${successCount !== 1 ? 's' : ''}`);
    if (failCount > 0) toast.error(`Failed to assign ${failCount} contact${failCount !== 1 ? 's' : ''}`);

    setSelectedContacts(new Set());
    setSelectAllMode(false);
    clearCacheByKey('Contact');
    loadContacts();
    loadTotalStats();
  };

  return {
    handleBulkDelete,
    handleBulkStatusChange,
    handleBulkAssign,
  };
}
