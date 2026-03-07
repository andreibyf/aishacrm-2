import { Account } from '@/api/entities';
import { toast } from 'sonner';

/**
 * useAccountsBulkOps hook - Manages bulk operations for accounts
 *
 * Handles:
 * - Bulk delete (with select-all mode)
 * - Bulk type change (not status — accounts use "type")
 * - Bulk assign
 *
 * Uses window.confirm for bulk destructive operations (preserved from original).
 */
export function useAccountsBulkOps({
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
}) {
  // Helper: fetch all matching accounts for select-all operations.
  // Uses the same server-side search/type params as loadAccounts so bulk ops
  // always act on exactly the records the user sees on screen.
  const fetchAllMatching = async () => {
    const currentTenantFilter = { ...getTenantFilter() };
    if (searchTerm) {
      currentTenantFilter.search = searchTerm.trim();
    }
    if (typeFilter !== 'all') {
      currentTenantFilter.type = typeFilter;
    }
    const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
    const allAccounts = await Account.filter(currentTenantFilter, sortString, 10000);

    // Client-side tag filtering (not supported server-side)
    let filtered = Array.isArray(allAccounts) ? allAccounts : [];
    if (selectedTags.length > 0) {
      filtered = filtered.filter(
        (a) => Array.isArray(a.tags) && selectedTags.every((tag) => a.tags.includes(tag)),
      );
    }
    return filtered;
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      if (
        !window.confirm(
          `Delete ALL ${totalItems} account(s) matching current filters? This cannot be undone!`,
        )
      )
        return;

      try {
        startProgress({ message: 'Fetching accounts to delete...' });
        const filtered = await fetchAllMatching();
        const deleteCount = filtered.length;

        updateProgress({
          message: `Deleting ${deleteCount} accounts...`,
          total: deleteCount,
          current: 0,
        });

        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((a) => Account.delete(a.id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
          updateProgress({
            current: successCount + failCount,
            message: `Deleted ${successCount} of ${deleteCount} accounts...`,
          });
        }

        completeProgress();
        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        clearCacheByKey('Account');
        await Promise.all([loadAccounts(), loadTotalStats()]);
        if (successCount > 0) toast.success(`${successCount} account(s) deleted`);
        if (failCount > 0) toast.error(`${failCount} account(s) failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete accounts:', error);
        toast.error('Failed to delete accounts');
      }
      return;
    }

    // Selected items mode
    if (!selectedAccounts || selectedAccounts.size === 0) {
      toast.error('No accounts selected');
      return;
    }

    if (!window.confirm(`Delete ${selectedAccounts.size} account(s)?`)) return;

    try {
      const accountIds = [...selectedAccounts];
      const selectedCount = accountIds.length;
      startProgress({
        message: `Deleting ${selectedCount} accounts...`,
        total: selectedCount,
        current: 0,
      });

      const BATCH_SIZE = 50;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
        const batch = accountIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(batch.map((id) => Account.delete(id)));
        batchResults.forEach((r) => {
          if (r.status === 'fulfilled') succeeded++;
          else {
            const is404 = r.reason?.response?.status === 404;
            if (is404) succeeded++;
            else failed++;
          }
        });
        updateProgress({
          current: succeeded + failed,
          message: `Deleted ${succeeded} of ${selectedCount} accounts...`,
        });
      }

      completeProgress();
      setSelectedAccounts(new Set());
      clearCacheByKey('Account');
      await Promise.all([loadAccounts(), loadTotalStats()]);

      if (failed > 0) toast.error(`${succeeded} deleted, ${failed} failed`);
      else toast.success(`${succeeded} account(s) deleted`);
    } catch (error) {
      completeProgress();
      console.error('Failed to delete accounts:', error);
      toast.error('Failed to delete accounts');
      setSelectedAccounts(new Set());
      await Promise.all([loadAccounts(), loadTotalStats()]);
    }
  };

  const handleBulkTypeChange = async (newType) => {
    if (selectAllMode) {
      if (
        !window.confirm(
          `Update type for ALL ${totalItems} account(s) matching current filters to ${newType}?`,
        )
      )
        return;

      try {
        const filtered = await fetchAllMatching();
        const updateCount = filtered.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((a) => Account.update(a.id, { type: newType })));
        }

        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        clearCacheByKey('Account');
        await Promise.all([loadAccounts(), loadTotalStats()]);
        toast.success(`Updated ${updateCount} account(s) to ${newType}`);
      } catch (error) {
        console.error('Failed to update accounts:', error);
        toast.error('Failed to update accounts');
      }
    } else {
      if (!selectedAccounts || selectedAccounts.size === 0) {
        toast.error('No accounts selected');
        return;
      }

      try {
        const promises = [...selectedAccounts].map((id) => Account.update(id, { type: newType }));
        await Promise.all(promises);
        setSelectedAccounts(new Set());
        clearCacheByKey('Account');
        await Promise.all([loadAccounts(), loadTotalStats()]);
        toast.success(`Updated ${promises.length} account(s) to ${newType}`);
      } catch (error) {
        console.error('Failed to update accounts:', error);
        toast.error('Failed to update accounts');
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    let accountRecords;
    if (selectAllMode) {
      const confirmed = confirm
        ? await confirm({
            title: 'Assign all accounts?',
            description: `Assign ALL ${totalItems} account(s) matching current filters?`,
            confirmText: 'Assign All',
            cancelText: 'Cancel',
          })
        : window.confirm(`Assign ALL ${totalItems} account(s) matching current filters?`);
      if (!confirmed) return;
      accountRecords = await fetchAllMatching();
    } else {
      if (!selectedAccounts || selectedAccounts.size === 0) {
        toast.error('No accounts selected');
        return;
      }
      accountRecords = (accounts || []).filter((a) => selectedAccounts.has(a.id));
    }

    const ids = accountRecords.map((a) => a.id);

    try {
      const tenantId = user?.tenant_id;

      // Check for team mismatch
      let overrideTeam = false;
      if (assignedTo && confirm) {
        const withTeam = accountRecords.filter((a) => a.assigned_to_team);
        if (withTeam.length > 0) {
          const teamNames = [
            ...new Set(withTeam.map((a) => a.assigned_to_team_name).filter(Boolean)),
          ];
          const choice = await confirm({
            title: 'Team assignment conflict',
            description: `${withTeam.length} of ${ids.length} selected account(s) are currently assigned to ${teamNames.join(', ') || 'a team'}. The selected employee may be on a different team.`,
            confirmText: 'Continue',
            cancelText: 'Cancel',
            variant: 'default',
            extraActions: [{ label: 'Override team', value: 'override' }],
          });
          if (!choice) return;
          if (choice === 'override') overrideTeam = true;
        }
      }

      const CHUNK_SIZE = 500;
      let successCount = 0;
      let skipCount = 0;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const result = await Account.bulkAssign(chunk, assignedTo || null, tenantId, {
          overrideTeam,
        });
        successCount += result.updated;
        skipCount += result.skipped;
      }

      setSelectedAccounts(new Set());
      if (selectAllMode) setSelectAllMode(false);
      clearCacheByKey('Account');
      await Promise.all([loadAccounts(), loadTotalStats()]);
      if (successCount > 0) toast.success(`Assigned ${successCount} account(s)`);
      if (skipCount > 0) toast.warning(`${skipCount} account(s) skipped (no write access)`);
    } catch (error) {
      console.error('Failed to assign accounts:', error);
      toast.error('Failed to assign accounts');
    }
  };

  return {
    handleBulkDelete,
    handleBulkTypeChange,
    handleBulkAssign,
  };
}
