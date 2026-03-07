import { useState, useCallback } from 'react';
import { Lead } from '@/api/entities';
import { toast } from 'sonner';

// [2026-03-07 Cursor] — extracted from Leads.jsx (PR #331)

/**
 * useLeadsBulkOps hook - Manages bulk operations for leads
 *
 * Handles:
 * - Selection state (selectedLeads, selectAllMode) and toggle/clear
 * - Bulk delete (with select-all mode support)
 * - Bulk status change
 * - Bulk assign
 * - Progress tracking during operations
 * - Cache invalidation after operations
 *
 * @param {Object} params - Hook parameters
 * @param {Array} params.leads - Current leads array
 * @param {number} params.totalItems - Total number of leads matching filters
 * @param {Function} params.getTenantFilter - Build tenant/scope filter
 * @param {string} params.statusFilter - Current status filter
 * @param {string} params.searchTerm - Search query
 * @param {Array} params.selectedTags - Selected tag filters
 * @param {string} params.ageFilter - Age bucket filter
 * @param {Array} params.ageBuckets - Age bucket definitions
 * @param {Function} params.calculateLeadAge - Helper to calculate lead age
 * @param {Function} params.loadLeads - Reload leads function
 * @param {Function} params.loadTotalStats - Reload stats function
 * @param {Function} params.startProgress - Start progress tracking
 * @param {Function} params.updateProgress - Update progress
 * @param {Function} params.completeProgress - Complete progress
 * @param {Function} params.confirm - Confirmation dialog
 * @param {Function} params.clearCache - Clear all cache
 * @param {Function} params.clearCacheByKey - Clear cache by key
 * @param {Function} params.clearDashboardResultsCache - Clear dashboard results cache
 * @param {Function} params.clearAllDashboardCaches - Clear all dashboard caches
 * @param {Function} params.setLeads - Update leads array (for optimistic UI)
 * @param {Function} params.setTotalItems - Update total items count
 * @param {number} params.currentPage - Current page number
 * @param {number} params.pageSize - Page size
 * @param {Object} params.user - Current user
 * @returns {Object} selectedLeads, selectAllMode, toggleSelection, toggleSelectAll, clearSelection, handleSelectAllRecords, handleBulkDelete, handleBulkStatusChange, handleBulkAssign
 */
export function useLeadsBulkOps({
  leads,
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
}) {
  const [selectedLeads, setSelectedLeads] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);

  const toggleSelection = useCallback((id) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectAllMode(false);
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedLeads((prev) => {
      if (prev.size === leads.length && leads.length > 0) {
        return new Set();
      }
      return new Set(leads.map((l) => l.id));
    });
    setSelectAllMode(false);
  }, [leads]);

  const clearSelection = useCallback(() => {
    setSelectedLeads(new Set());
    setSelectAllMode(false);
  }, []);

  const handleSelectAllRecords = useCallback(() => {
    setSelectAllMode(true);
    setSelectedLeads(new Set(leads.map((l) => l.id)));
  }, [leads]);

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: 'Delete all leads?',
        description: `Delete ALL ${totalItems} lead(s) matching current filters? This cannot be undone!`,
        variant: 'destructive',
        confirmText: 'Delete All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        startProgress({ message: 'Fetching leads to delete...' });
        let currentFilter = getTenantFilter();

        if (statusFilter !== 'all') {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchFilter = {
            $or: [
              { first_name: { $icontains: searchTerm } },
              { last_name: { $icontains: searchTerm } },
              { email: { $icontains: searchTerm } },
              { phone: { $icontains: searchTerm } },
              { company: { $icontains: searchTerm } },
              { job_title: { $icontains: searchTerm } },
            ],
          };
          // Merge with any existing JSON filter (e.g. unassigned scope) instead of overwriting
          const existingFilter = currentFilter.filter;
          let mergedFilter = searchFilter;
          if (existingFilter) {
            try {
              const parsed =
                typeof existingFilter === 'string' ? JSON.parse(existingFilter) : existingFilter;
              if (parsed && typeof parsed === 'object') {
                mergedFilter = { $and: [parsed, searchFilter] };
              }
            } catch {
              // parsing failed — use searchFilter alone
            }
          }
          currentFilter = { ...currentFilter, filter: JSON.stringify(mergedFilter) };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToDeleteServerFilter = await Lead.filter(currentFilter, 'id', 10000);
        let allLeadsToDelete = allLeadsToDeleteServerFilter;

        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToDelete = allLeadsToDeleteServerFilter.filter((lead) => {
              const age = calculateLeadAge(lead.created_date || lead.created_at || lead);
              return age >= 0 && age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        const deleteCount = allLeadsToDelete.length;

        updateProgress({
          message: `Deleting ${deleteCount} leads...`,
          total: deleteCount,
          current: 0,
        });

        // Bulk delete via single endpoint — avoids N×429 from individual deletes
        const CHUNK_SIZE = 500; // endpoint max
        let successCount = 0;
        let failCount = 0;
        const idsToDelete = allLeadsToDelete.map((l) => l.id);
        for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
          const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
          try {
            const result = await Lead.bulkDelete(
              chunk,
              getTenantFilter().tenant_id || user.tenant_id,
            );
            successCount += result?.deleted ?? chunk.length;
          } catch (err) {
            console.error('[Leads] Bulk delete chunk failed:', err);
            failCount += chunk.length;
          }
          updateProgress({
            current: Math.min(i + CHUNK_SIZE, idsToDelete.length),
            message: `Deleted ${successCount} of ${deleteCount} leads...`,
          });
        }

        completeProgress();

        setSelectedLeads(new Set());
        setSelectAllMode(false);

        // Optimistic UI: only clear the list if all deletes succeeded
        if (failCount === 0) {
          setLeads([]);
          setTotalItems(0);
        }

        if (successCount > 0) toast.success(`${successCount} lead(s) deleted`);
        if (failCount > 0) toast.error(`${failCount} lead(s) failed to delete`);

        // Clear all caches so dashboard and lead lists show fresh data
        clearCache('Lead');
        clearCacheByKey('Lead');
        clearDashboardResultsCache();
        clearAllDashboardCaches();
        await Promise.all([loadLeads(1, pageSize), loadTotalStats()]);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete leads:', error);
        toast.error('Failed to delete leads');
      }
    } else {
      if (!selectedLeads || selectedLeads.size === 0) {
        toast.error('No leads selected');
        return;
      }

      const confirmed = await confirm({
        title: 'Delete selected leads?',
        description: `Delete ${selectedLeads.size} lead(s)?`,
        variant: 'destructive',
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        const tenantId = getTenantFilter().tenant_id || user.tenant_id;
        if (!tenantId) {
          throw new Error('Cannot delete: tenant_id is not available');
        }

        const selectedCount = selectedLeads.size;
        startProgress({
          message: `Deleting ${selectedCount} leads...`,
          total: selectedCount,
          current: 0,
        });

        // Bulk delete via single endpoint — avoids N×429 from individual deletes
        const selectedArray = [...selectedLeads];
        const CHUNK_SIZE = 500;
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < selectedArray.length; i += CHUNK_SIZE) {
          const chunk = selectedArray.slice(i, i + CHUNK_SIZE);
          try {
            const result = await Lead.bulkDelete(chunk, tenantId);
            successCount += result?.deleted ?? chunk.length;
          } catch (err) {
            console.error('[Leads] Bulk delete chunk failed:', err);
            failedCount += chunk.length;
          }
          updateProgress({
            current: Math.min(i + CHUNK_SIZE, selectedArray.length),
            message: `Deleted ${successCount} of ${selectedCount} leads...`,
          });
        }

        completeProgress();

        setSelectedLeads(new Set());

        // Optimistic UI: only remove items if all chunks succeeded
        if (failedCount === 0) {
          const deletedIds = new Set(selectedArray);
          setLeads((prev) => prev.filter((l) => !deletedIds.has(l.id)));
          setTotalItems((prev) => Math.max(0, prev - successCount));
        }

        if (failedCount > 0) {
          toast.error(`${successCount} deleted, ${failedCount} failed`);
        } else {
          toast.success(`${successCount} lead(s) deleted`);
        }

        // Clear all caches so dashboard and lead lists show fresh data
        clearCache('Lead');
        clearCacheByKey('Lead');
        clearDashboardResultsCache();
        clearAllDashboardCaches();
        await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete leads:', error);
        toast.error('Failed to delete leads');
        setSelectedLeads(new Set());
        clearCache('Lead');
        clearCacheByKey('Lead');
        await loadLeads(currentPage, pageSize);
        await loadTotalStats();
      }
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: 'Update all leads?',
        description: `Update status for ALL ${totalItems} lead(s) matching current filters to ${newStatus}?`,
        variant: 'default',
        confirmText: 'Update All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== 'all') {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchFilter = {
            $or: [
              { first_name: { $icontains: searchTerm } },
              { last_name: { $icontains: searchTerm } },
              { email: { $icontains: searchTerm } },
              { phone: { $icontains: searchTerm } },
              { company: { $icontains: searchTerm } },
              { job_title: { $icontains: searchTerm } },
            ],
          };
          // Merge with any existing JSON filter (e.g. unassigned scope) instead of overwriting
          const existingFilter = currentFilter.filter;
          let mergedFilter = searchFilter;
          if (existingFilter) {
            try {
              const parsed =
                typeof existingFilter === 'string' ? JSON.parse(existingFilter) : existingFilter;
              if (parsed && typeof parsed === 'object') {
                mergedFilter = { $and: [parsed, searchFilter] };
              }
            } catch {
              // parsing failed — use searchFilter alone
            }
          }
          currentFilter = { ...currentFilter, filter: JSON.stringify(mergedFilter) };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToUpdateServerFilter = await Lead.filter(currentFilter, 'id', 10000);
        let allLeadsToUpdate = allLeadsToUpdateServerFilter;

        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToUpdate = allLeadsToUpdateServerFilter.filter((lead) => {
              const age = calculateLeadAge(lead.created_date || lead.created_at || lead);
              return age >= 0 && age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        // Update in batches
        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < allLeadsToUpdate.length; i += BATCH_SIZE) {
          const batch = allLeadsToUpdate.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((l) => Lead.update(l.id, { status: newStatus })),
          );
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache('Lead');
        clearCacheByKey('Lead');
        await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
        if (successCount > 0) toast.success(`Updated ${successCount} lead(s) to ${newStatus}`);
        if (failCount > 0) toast.error(`${failCount} lead(s) failed to update`);
      } catch (error) {
        console.error('Failed to update leads:', error);
        toast.error('Failed to update leads');
      }
    } else {
      if (!selectedLeads || selectedLeads.size === 0) {
        toast.error('No leads selected');
        return;
      }

      try {
        const promises = [...selectedLeads].map((id) => Lead.update(id, { status: newStatus }));

        await Promise.all(promises);
        setSelectedLeads(new Set());
        clearCache('Lead');
        clearCacheByKey('Lead');
        await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
        toast.success(`Updated ${promises.length} lead(s) to ${newStatus}`);
      } catch (error) {
        console.error('Failed to update leads:', error);
        toast.error('Failed to update leads');
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: 'Assign all leads?',
        description: `Assign ALL ${totalItems} lead(s) matching current filters?`,
        variant: 'default',
        confirmText: 'Assign All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== 'all') {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchFilter = {
            $or: [
              { first_name: { $icontains: searchTerm } },
              { last_name: { $icontains: searchTerm } },
              { email: { $icontains: searchTerm } },
              { phone: { $icontains: searchTerm } },
              { company: { $icontains: searchTerm } },
              { job_title: { $icontains: searchTerm } },
            ],
          };
          // Merge with any existing JSON filter (e.g. unassigned scope) instead of overwriting
          const existingFilter = currentFilter.filter;
          let mergedFilter = searchFilter;
          if (existingFilter) {
            try {
              const parsed =
                typeof existingFilter === 'string' ? JSON.parse(existingFilter) : existingFilter;
              if (parsed && typeof parsed === 'object') {
                mergedFilter = { $and: [parsed, searchFilter] };
              }
            } catch {
              // parsing failed — use searchFilter alone
            }
          }
          currentFilter = { ...currentFilter, filter: JSON.stringify(mergedFilter) };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToAssignServerFilter = await Lead.filter(currentFilter, 'id', 10000);
        let allLeadsToAssign = allLeadsToAssignServerFilter;

        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToAssign = allLeadsToAssignServerFilter.filter((lead) => {
              const age = calculateLeadAge(lead.created_date || lead.created_at || lead);
              return age >= 0 && age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        // Update in batches
        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < allLeadsToAssign.length; i += BATCH_SIZE) {
          const batch = allLeadsToAssign.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((l) => Lead.update(l.id, { assigned_to: assignedTo || null })),
          );
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache('Lead');
        clearCacheByKey('Lead');
        await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
        if (successCount > 0) toast.success(`Assigned ${successCount} lead(s)`);
        if (failCount > 0) toast.error(`${failCount} lead(s) failed to assign`);
      } catch (error) {
        console.error('Failed to assign leads:', error);
        toast.error('Failed to assign leads');
      }
    } else {
      if (!selectedLeads || selectedLeads.size === 0) {
        toast.error('No leads selected');
        return;
      }

      try {
        const promises = [...selectedLeads].map((id) =>
          Lead.update(id, { assigned_to: assignedTo || null }),
        );

        await Promise.all(promises);
        setSelectedLeads(new Set());
        clearCache('Lead');
        clearCacheByKey('Lead');
        await Promise.all([loadLeads(currentPage, pageSize), loadTotalStats()]);
        toast.success(`Assigned ${promises.length} lead(s)`);
      } catch (error) {
        console.error('Failed to assign leads:', error);
        toast.error('Failed to assign leads');
      }
    }
  };

  return {
    selectedLeads,
    selectAllMode,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    handleSelectAllRecords,
    handleBulkDelete,
    handleBulkStatusChange,
    handleBulkAssign,
  };
}
