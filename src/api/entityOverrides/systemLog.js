// SystemLog with safe fallback to suppress connection errors in local dev
// Extracted from src/api/entities.js
import { createEntity } from '../core/createEntity';
import { isLocalDevMode } from '../mockData';
import { logDev } from '../../utils/devLogger';

const baseSystemLog = createEntity('SystemLog');

export const SystemLog = {
  ...baseSystemLog,
  create: async (data) => {
    if (isLocalDevMode()) {
      // Silent fallback: don't try to POST to backend if it's not running
      // Just log to console and return success
      logDev('[Local Dev Mode] SystemLog.create (not persisted):', data);
      return {
        id: `local-log-${Date.now()}`,
        ...data,
        created_at: new Date().toISOString(),
      };
    }
    return baseSystemLog.create(data);
  },
};
