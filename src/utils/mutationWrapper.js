/**
 * Mutation Wrapper Utility
 *
 * Standardized wrapper for all CRUD operations that ensures:
 * 1. Cache clearing after mutations
 * 2. Data refresh from server
 * 3. Optional full page reload for critical operations
 * 4. Consistent error handling
 */

import { clearCacheByKey } from './fallbackCache';
import toast from 'react-hot-toast';

/**
 * Wrap a mutation operation with automatic cache clearing and data refresh
 *
 * @param {Object} config - Configuration object
 * @param {Function} config.operation - The mutation operation to execute (async function)
 * @param {string} config.entityType - Entity type for cache clearing (e.g., 'Contact', 'Account')
 * @param {Function} config.onSuccess - Callback after successful operation (for data refresh)
 * @param {Function} config.onError - Optional error callback
 * @param {string} config.successMessage - Success toast message
 * @param {string} config.errorMessage - Error toast message
 * @param {boolean} config.forceReload - If true, performs full page reload after success
 * @param {number} config.reloadDelay - Delay before reload in ms (default: 300)
 * @returns {Promise} - Result of the operation
 */
export async function withMutation({
  operation,
  entityType,
  onSuccess,
  onError,
  successMessage,
  errorMessage = 'Operation failed',
  forceReload = false,
  reloadDelay = 300,
}) {
  try {
    // Execute the mutation
    const result = await operation();

    // Clear cache for the entity type
    if (entityType) {
      clearCacheByKey(entityType);
    }

    // Call success callback (for data refresh)
    if (onSuccess && typeof onSuccess === 'function') {
      await onSuccess(result);
    }

    // Show success message
    if (successMessage) {
      toast.success(successMessage);
    }

    // Force full page reload if requested (for critical operations)
    if (forceReload) {
      setTimeout(() => {
        window.location.reload();
      }, reloadDelay);
    }

    return result;
  } catch (error) {
    console.error(`Mutation error for ${entityType}:`, error);

    // Call error callback if provided
    if (onError && typeof onError === 'function') {
      await onError(error);
    }

    // Show error message
    const message = error?.response?.data?.message || error?.message || errorMessage;
    toast.error(message);

    throw error; // Re-throw for caller to handle if needed
  }
}

/**
 * Wrap a delete operation with automatic refresh
 */
export async function withDelete({
  deleteOperation,
  entityType,
  refreshOperation,
  successMessage = 'Deleted successfully',
  forceReload = false,
}) {
  return withMutation({
    operation: deleteOperation,
    entityType,
    onSuccess: refreshOperation,
    successMessage,
    errorMessage: `Failed to delete ${entityType?.toLowerCase() || 'item'}`,
    forceReload,
  });
}

/**
 * Wrap an update operation with automatic refresh
 */
export async function withUpdate({
  updateOperation,
  entityType,
  refreshOperation,
  successMessage = 'Updated successfully',
  forceReload = false,
}) {
  return withMutation({
    operation: updateOperation,
    entityType,
    onSuccess: refreshOperation,
    successMessage,
    errorMessage: `Failed to update ${entityType?.toLowerCase() || 'item'}`,
    forceReload,
  });
}

/**
 * Wrap a create operation with automatic refresh
 */
export async function withCreate({
  createOperation,
  entityType,
  refreshOperation,
  successMessage = 'Created successfully',
  forceReload = false,
}) {
  return withMutation({
    operation: createOperation,
    entityType,
    onSuccess: refreshOperation,
    successMessage,
    errorMessage: `Failed to create ${entityType?.toLowerCase() || 'item'}`,
    forceReload,
  });
}

/**
 * Batch operation wrapper with progress tracking
 *
 * @param {Object} config - Configuration object
 * @param {Array} config.items - Array of items to process
 * @param {Function} config.operation - Operation to perform on each item (async)
 * @param {Object} config.progressCallbacks - { start, update, complete }
 * @param {string} config.itemName - Name of items for progress messages
 * @param {number} config.batchSize - Batch size (default: 50)
 * @returns {Object} - { successCount, failCount, results }
 */
export async function withBatchOperation({
  items,
  operation,
  progressCallbacks,
  itemName = 'items',
  batchSize = 50,
}) {
  const { startProgress, updateProgress, completeProgress } = progressCallbacks;

  if (startProgress) {
    startProgress({
      message: `Processing ${items.length} ${itemName}...`,
      total: items.length,
      current: 0,
    });
  }

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map((item) => operation(item)));

    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        successCount++;
        results.push({ success: true, data: result.value, item: batch[idx] });
      } else {
        // Don't count 404s as failures (already deleted/not found)
        const is404 =
          result.reason?.response?.status === 404 || result.reason?.message?.includes('404');
        if (!is404) {
          failCount++;
          results.push({ success: false, error: result.reason, item: batch[idx] });
        } else {
          successCount++; // Count 404s as success
        }
      }
    });

    if (updateProgress) {
      updateProgress({
        current: Math.min(i + batchSize, items.length),
        message: `Processed ${successCount} of ${items.length} ${itemName}...`,
      });
    }
  }

  if (completeProgress) {
    completeProgress();
  }

  return { successCount, failCount, results };
}
