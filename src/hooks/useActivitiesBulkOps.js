import { Activity } from '@/api/entities';
import { toast } from 'sonner';

/**
 * useActivitiesBulkOps hook - Manages bulk operations for activities
 *
 * Handles:
 * - Bulk delete (with select-all mode)
 * - Bulk status change
 * - Bulk assign
 * - Progress tracking during operations
 *
 * Note: Activities uses window.confirm for bulk ops (unlike Opportunities which uses confirm dialog).
 * This is preserved from the original to maintain existing behavior.
 */
export function useActivitiesBulkOps({
  activities: _activities,
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
}) {
  // Helper to build search-augmented filter for select-all operations
  const buildBulkFilter = () => {
    let currentFilter = buildFilter();
    if (searchTerm) {
      currentFilter = { ...currentFilter, q: searchTerm.trim() };
    }
    if (selectedTags && selectedTags.length > 0) {
      currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
    }
    return currentFilter;
  };

  // Helper to extract activities array from API result (handles legacy array or object formats)
  const extractItems = (result) =>
    Array.isArray(result) ? result : result?.activities || [];

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      if (!window.confirm(`Delete ALL ${totalItems} activity/activities? This cannot be undone!`))
        return;

      try {
        startProgress({ message: 'Fetching activities to delete...' });
        const currentFilter = buildBulkFilter();

        const activitiesResult = await Activity.filter(currentFilter, 'id', 10000);
        const allActivities = extractItems(activitiesResult);
        const deleteCount = allActivities.length;

        updateProgress({ message: `Deleting ${deleteCount} activities...`, total: deleteCount, current: 0 });

        const BATCH_SIZE = 50;
        let deletedCount = 0;
        let failCount = 0;
        for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
          const batch = allActivities.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((a) => Activity.delete(a.id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') deletedCount++;
            else {
              const is404 = r.reason?.message?.includes('404');
              if (!is404) failCount++;
              else deletedCount++;
            }
          });
          updateProgress({ current: deletedCount + failCount, message: `Deleted ${deletedCount} of ${deleteCount} activities...` });
        }

        completeProgress();

        const deletedIds = new Set(allActivities.map((a) => a.id));
        setActivities((prev) => prev.filter((a) => !deletedIds.has(a.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deleteCount));

        setSelectedActivities(new Set());
        setSelectAllMode(false);

        setTimeout(() => {
          clearCache('');
          clearCacheByKey('Activity');
          loadActivities(1, pageSize);
        }, 500);

        if (deletedCount > 0) toast.success(`${deletedCount} activity/activities deleted`);
        if (failCount > 0) toast.error(`${failCount} failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete activities:', error);
        toast.error('Failed to delete activities');
      }
    } else {
      if (!selectedActivities || selectedActivities.size === 0) {
        toast.error('No activities selected');
        return;
      }

      if (!window.confirm(`Delete ${selectedActivities.size} activity/activities?`)) return;

      try {
        const selectedCount = selectedActivities.size;
        startProgress({ message: `Deleting ${selectedCount} activities...`, total: selectedCount, current: 0 });

        const selectedArray = [...selectedActivities];
        const BATCH_SIZE = 50;
        let deletedCount = 0;
        let failCount = 0;

        for (let i = 0; i < selectedArray.length; i += BATCH_SIZE) {
          const batch = selectedArray.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((id) => Activity.delete(id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') deletedCount++;
            else {
              const is404 = r.reason?.message?.includes('404');
              if (!is404) failCount++;
              else deletedCount++;
            }
          });
          updateProgress({ current: deletedCount + failCount, message: `Deleted ${deletedCount} of ${selectedCount} activities...` });
        }

        completeProgress();

        const deletedIds = new Set(selectedActivities);
        setActivities((prev) => prev.filter((a) => !deletedIds.has(a.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deletedIds.size));

        setSelectedActivities(new Set());

        setTimeout(() => {
          clearCache('');
          clearCacheByKey('Activity');
          loadActivities(currentPage, pageSize);
        }, 500);

        if (deletedCount > 0) toast.success(`${deletedCount} activity/activities deleted`);
        if (failCount > 0) toast.error(`${failCount} failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to delete activities:', error);
        toast.error('Failed to delete activities');
      }
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectAllMode) {
      if (!window.confirm(`Update status for ALL ${totalItems} activity/activities to ${newStatus}?`))
        return;

      try {
        startProgress({ message: 'Fetching activities to update...' });
        const currentFilter = buildBulkFilter();

        const statusResult = await Activity.filter(currentFilter, 'id', 10000);
        const allActivities = extractItems(statusResult);
        const updateCount = allActivities.length;

        updateProgress({ message: `Updating ${updateCount} activities...`, total: updateCount, current: 0 });

        const BATCH_SIZE = 50;
        let updatedCount = 0;
        for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
          const batch = allActivities.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((a) => Activity.update(a.id, { status: newStatus })));
          updatedCount += batch.length;
          updateProgress({ current: updatedCount, message: `Updated ${updatedCount} of ${updateCount} activities...` });
        }

        completeProgress();
        setSelectedActivities(new Set());
        setSelectAllMode(false);
        clearCache('');
        clearCacheByKey('Activity');
        await loadActivities(currentPage, pageSize);
        toast.success(`Updated ${updateCount} activity/activities to ${newStatus}`);
      } catch (error) {
        completeProgress();
        console.error('Failed to update activities:', error);
        toast.error('Failed to update activities');
      }
    } else {
      if (!selectedActivities || selectedActivities.size === 0) {
        toast.error('No activities selected');
        return;
      }

      try {
        const selectedCount = selectedActivities.size;
        startProgress({ message: `Updating ${selectedCount} activities...`, total: selectedCount, current: 0 });

        const selectedArray = [...selectedActivities];
        const BATCH_SIZE = 50;
        let updatedCount = 0;

        for (let i = 0; i < selectedArray.length; i += BATCH_SIZE) {
          const batch = selectedArray.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((id) => Activity.update(id, { status: newStatus })));
          updatedCount += batch.length;
          updateProgress({ current: updatedCount, message: `Updated ${updatedCount} of ${selectedCount} activities...` });
        }

        completeProgress();
        setSelectedActivities(new Set());
        clearCache('');
        clearCacheByKey('Activity');
        await loadActivities(currentPage, pageSize);
        toast.success(`Updated ${selectedCount} activity/activities to ${newStatus}`);
      } catch (error) {
        completeProgress();
        console.error('Failed to update activities:', error);
        toast.error('Failed to update activities');
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      if (!window.confirm(`Assign ALL ${totalItems} activity/activities?`)) return;

      try {
        startProgress({ message: 'Fetching activities to assign...' });
        const currentFilter = buildBulkFilter();

        const assignResult = await Activity.filter(currentFilter, 'id', 10000);
        const allActivities = extractItems(assignResult);
        const updateCount = allActivities.length;

        updateProgress({ message: `Assigning ${updateCount} activities...`, total: updateCount, current: 0 });

        const BATCH_SIZE = 50;
        let assignedCount = 0;
        for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
          const batch = allActivities.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((a) => Activity.update(a.id, { assigned_to: assignedTo || null })));
          assignedCount += batch.length;
          updateProgress({ current: assignedCount, message: `Assigned ${assignedCount} of ${updateCount} activities...` });
        }

        completeProgress();
        setSelectedActivities(new Set());
        setSelectAllMode(false);
        clearCache('');
        clearCacheByKey('Activity');
        await loadActivities(currentPage, pageSize);
        toast.success(`Assigned ${updateCount} activity/activities`);
      } catch (error) {
        completeProgress();
        console.error('Failed to assign activities:', error);
        toast.error('Failed to assign activities');
      }
    } else {
      if (!selectedActivities || selectedActivities.size === 0) {
        toast.error('No activities selected');
        return;
      }

      try {
        const selectedCount = selectedActivities.size;
        startProgress({ message: `Assigning ${selectedCount} activities...`, total: selectedCount, current: 0 });

        const selectedArray = [...selectedActivities];
        const BATCH_SIZE = 50;
        let assignedCount = 0;

        for (let i = 0; i < selectedArray.length; i += BATCH_SIZE) {
          const batch = selectedArray.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((id) => Activity.update(id, { assigned_to: assignedTo || null })));
          assignedCount += batch.length;
          updateProgress({ current: assignedCount, message: `Assigned ${assignedCount} of ${selectedCount} activities...` });
        }

        completeProgress();
        setSelectedActivities(new Set());
        clearCache('');
        clearCacheByKey('Activity');
        await loadActivities(currentPage, pageSize);
        toast.success(`Assigned ${selectedCount} activity/activities`);
      } catch (error) {
        completeProgress();
        console.error('Failed to assign activities:', error);
        toast.error('Failed to assign activities');
      }
    }
  };

  return {
    handleBulkDelete,
    handleBulkStatusChange,
    handleBulkAssign,
  };
}
