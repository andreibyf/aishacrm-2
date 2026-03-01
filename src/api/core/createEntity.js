// Entity factory - creates standard CRUD methods for an entity
// Extracted from src/api/entities.js
import { callBackendAPI } from './httpClient';

// Create a standard entity object that calls our independent backend API
export const createEntity = (entityName) => {
  return {
    // Add filter method as alias for list with better parameter handling
    filter: async (filterObj, sortField, limit, offset) => {
      // Merge sort field and pagination into filter object if provided
      const queryObj = { ...filterObj };
      if (sortField) queryObj.sort = sortField;
      if (limit !== undefined) queryObj.limit = limit;
      if (offset !== undefined) queryObj.offset = offset;
      if (import.meta.env.DEV) {
        console.log(
          `[Entity.filter] ${entityName} CALLING with sort:`,
          sortField,
          'limit:',
          limit,
          'queryObj:',
          queryObj,
        );
      }
      const result = await callBackendAPI(entityName, 'GET', queryObj);
      if (import.meta.env.DEV) {
        console.log(`[Entity.filter] ${entityName}:`, {
          type: typeof result,
          isArray: Array.isArray(result),
          length: result?.length,
        });
      }
      return result;
    },
    // List method - handle both string orderBy and object filters
    list: async (filterObjOrOrderBy, _sortField, _limit) => {
      // If first param is a string starting with - or contains only alphanumeric/underscore, treat as orderBy
      if (typeof filterObjOrOrderBy === 'string') {
        return callBackendAPI(entityName, 'GET', { orderBy: filterObjOrOrderBy });
      }
      return callBackendAPI(entityName, 'GET', filterObjOrOrderBy);
    },
    // Get by ID
    get: async (id) => {
      return callBackendAPI(entityName, 'GET', null, id);
    },
    // Create
    create: async (data) => {
      return callBackendAPI(entityName, 'POST', data);
    },
    // Update
    update: async (id, data) => {
      // For Opportunities explicitly append tenant_id as query param to avoid body-only ambiguity
      if (entityName === 'Opportunity') {
        const enriched = { ...data };
        return await callBackendAPI(entityName, 'PUT', enriched, id);
      }
      return callBackendAPI(entityName, 'PUT', data, id);
    },
    // Delete
    delete: async (id) => {
      return callBackendAPI(entityName, 'DELETE', null, id);
    },
    // Bulk create
    bulkCreate: async (items) => {
      if (!Array.isArray(items)) {
        throw new Error('bulkCreate requires an array of items');
      }
      return Promise.all(items.map((item) => callBackendAPI(entityName, 'POST', item)));
    },
  };
};
