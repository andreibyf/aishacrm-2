import { Opportunity } from '@/api/entities';
import { toast } from 'sonner';

/**
 * useOpportunitiesBulkOps hook - Manages bulk operations for opportunities
 *
 * Handles:
 * - Bulk delete (with select-all mode support)
 * - Bulk stage change
 * - Bulk assign
 * - Progress tracking during operations
 *
 * @param {Object} params - Hook parameters
 * @returns {Object} Bulk operation handlers
 */
export function useOpportunitiesBulkOps({
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
}) {
  // Helper to build the search filter (shared across all bulk ops)
  const buildSearchFilter = (effectiveFilter) => {
    if (!searchTerm) return effectiveFilter;

    const searchRegex = { $regex: searchTerm, $options: 'i' };
    const searchConditions = [
      { name: searchRegex },
      { account_name: searchRegex },
      { contact_name: searchRegex },
      { description: searchRegex },
    ];

    if (effectiveFilter.$or) {
      const { $or: existingOr, ...restFilter } = effectiveFilter;
      return {
        ...restFilter,
        $and: [
          ...(restFilter.$and || []),
          { $or: existingOr },
          { $or: searchConditions },
        ],
      };
    }
    return { ...effectiveFilter, $or: searchConditions };
  };

  // Helper to build the full effective filter for select-all operations
  const buildEffectiveFilter = () => {
    let effectiveFilter = getTenantFilter();

    if (stageFilter !== 'all') {
      effectiveFilter = { ...effectiveFilter, stage: stageFilter };
    }

    effectiveFilter = buildSearchFilter(effectiveFilter);

    if (selectedTags.length > 0) {
      effectiveFilter = { ...effectiveFilter, tags: { $all: selectedTags } };
    }

    return effectiveFilter;
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: 'Delete all opportunities?',
        description: `Delete ALL ${totalItems} opportunity/opportunities matching current filters? This cannot be undone!`,
        variant: 'destructive',
        confirmText: 'Delete All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        startProgress({ message: 'Fetching opportunities to delete...' });
        const effectiveFilter = buildEffectiveFilter();

        const allOpportunitiesToDelete = await Opportunity.filter(effectiveFilter, 'id', 10000);
        const deleteCount = allOpportunitiesToDelete.length;

        updateProgress({
          message: `Deleting ${deleteCount} opportunities...`,
          total: deleteCount,
          current: 0,
        });

        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < allOpportunitiesToDelete.length; i += BATCH_SIZE) {
          const batch = allOpportunitiesToDelete.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((o) => Opportunity.delete(o.id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else {
              const is404 = r.reason?.message?.includes('404');
              if (!is404) failCount++;
              else successCount++;
            }
          });
          updateProgress({
            current: successCount + failCount,
            message: `Deleted ${successCount} of ${deleteCount} opportunities...`,
          });
        }

        completeProgress();

        // Optimistic UI update
        const deletedIds = new Set(allOpportunitiesToDelete.map((o) => o.id));
        setOpportunities((prev) => prev.filter((o) => !deletedIds.has(o.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deleteCount));

        setSelectedOpportunities(new Set());
        setSelectAllMode(false);

        // Refresh in background
        setTimeout(async () => {
          clearCacheByKey('Opportunity');
          await Promise.all([loadOpportunities(1, pageSize), loadTotalStats()]);
        }, 500);

        toast.success(`${successCount} opportunity/opportunities deleted`);
        if (failCount > 0) toast.error(`${failCount} failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete opportunities:', error);
        toast.error('Failed to delete opportunities');
      }
    } else {
      if (!selectedOpportunities || selectedOpportunities.size === 0) {
        toast.error('No opportunities selected');
        return;
      }

      const confirmed = await confirm({
        title: 'Delete selected opportunities?',
        description: `Delete ${selectedOpportunities.size} opportunity/opportunities? This cannot be undone.`,
        variant: 'destructive',
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        const selectedCount = selectedOpportunities.size;
        startProgress({
          message: `Deleting ${selectedCount} opportunities...`,
          total: selectedCount,
          current: 0,
        });

        const selectedArray = [...selectedOpportunities];
        const BATCH_SIZE = 50;
        let succeeded = 0;
        let failed = 0;

        for (let i = 0; i < selectedArray.length; i += BATCH_SIZE) {
          const batch = selectedArray.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batch.map((id) => Opportunity.delete(id)),
          );
          batchResults.forEach((r) => {
            if (r.status === 'fulfilled') succeeded++;
            else {
              const is404 = r.reason?.message?.includes('404');
              if (!is404) failed++;
              else succeeded++;
            }
          });
          updateProgress({
            current: succeeded + failed,
            message: `Deleted ${succeeded} of ${selectedCount} opportunities...`,
          });
        }

        completeProgress();

        // Optimistic UI update
        const deletedIds = new Set(selectedOpportunities);
        setOpportunities((prev) => prev.filter((o) => !deletedIds.has(o.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deletedIds.size));

        setSelectedOpportunities(new Set());

        // Refresh in background
        setTimeout(async () => {
          clearCacheByKey('Opportunity');
          await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
        }, 500);

        toast.success(`${succeeded} opportunity/opportunities deleted`);
        if (failed > 0) toast.error(`${failed} failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete opportunities:', error);
        toast.error('Failed to delete opportunities');
      }
    }
  };

  const handleBulkStageChange = async (newStage) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: 'Update all opportunities?',
        description: `Update stage for ALL ${totalItems} opportunity/opportunities matching current filters to ${newStage.replace(/_/g, ' ')}?`,
        variant: 'default',
        confirmText: 'Update All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        const effectiveFilter = buildEffectiveFilter();

        const allOpportunitiesToUpdate = await Opportunity.filter(effectiveFilter, 'id', 10000);
        const updateCount = allOpportunitiesToUpdate.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allOpportunitiesToUpdate.length; i += BATCH_SIZE) {
          const batch = allOpportunitiesToUpdate.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((o) => Opportunity.update(o.id, { stage: newStage })));
        }

        setSelectedOpportunities(new Set());
        setSelectAllMode(false);
        clearCacheByKey('Opportunity');
        await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
        toast.success(
          `Updated ${updateCount} opportunity/opportunities to ${newStage.replace(/_/g, ' ')}`,
        );
      } catch (error) {
        console.error('Failed to update opportunities:', error);
        toast.error('Failed to update opportunities');
      }
    } else {
      if (!selectedOpportunities || selectedOpportunities.size === 0) {
        toast.error('No opportunities selected');
        return;
      }

      try {
        const promises = [...selectedOpportunities].map((id) =>
          Opportunity.update(id, { stage: newStage }),
        );

        await Promise.all(promises);
        setSelectedOpportunities(new Set());
        clearCacheByKey('Opportunity');
        await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
        toast.success(
          `Updated ${promises.length} opportunity/opportunities to ${newStage.replace(/_/g, ' ')}`,
        );
      } catch (error) {
        console.error('Failed to update opportunities:', error);
        toast.error('Failed to update opportunities');
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: 'Assign all opportunities?',
        description: `Assign ALL ${totalItems} opportunity/opportunities matching current filters?`,
        variant: 'default',
        confirmText: 'Assign All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        const effectiveFilter = buildEffectiveFilter();

        const allOpportunitiesToAssign = await Opportunity.filter(effectiveFilter, 'id', 10000);
        const updateCount = allOpportunitiesToAssign.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allOpportunitiesToAssign.length; i += BATCH_SIZE) {
          const batch = allOpportunitiesToAssign.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((o) => Opportunity.update(o.id, { assigned_to: assignedTo || null })),
          );
        }

        setSelectedOpportunities(new Set());
        setSelectAllMode(false);
        clearCacheByKey('Opportunity');
        await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
        toast.success(`Assigned ${updateCount} opportunity/opportunities`);
      } catch (error) {
        console.error('Failed to assign opportunities:', error);
        toast.error('Failed to assign opportunities');
      }
    } else {
      if (!selectedOpportunities || selectedOpportunities.size === 0) {
        toast.error('No opportunities selected');
        return;
      }

      try {
        const promises = [...selectedOpportunities].map((id) =>
          Opportunity.update(id, { assigned_to: assignedTo || null }),
        );

        await Promise.all(promises);
        setSelectedOpportunities(new Set());
        clearCacheByKey('Opportunity');
        await Promise.all([loadOpportunities(currentPage, pageSize), loadTotalStats()]);
        toast.success(`Assigned ${promises.length} opportunity/opportunities`);
      } catch (error) {
        console.error('Failed to assign opportunities:', error);
        toast.error('Failed to assign opportunities');
      }
    }
  };

  return {
    handleBulkDelete,
    handleBulkStageChange,
    handleBulkAssign,
  };
}
