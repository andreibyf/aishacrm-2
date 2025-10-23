// Moved `logTenantEvent` to this file to resolve Fast Refresh issues

let loggerInstance = null;

export function logTenantEvent(level, message, metadata) {
  if (!loggerInstance) {
    // Lazy load logger to avoid circular deps
    import('./Logger').then(module => {
      if (
        module &&
        typeof module.useLogger === 'object' &&
        typeof module.useLogger.info === 'function' &&
        typeof module.useLogger.warn === 'function' &&
        typeof module.useLogger.error === 'function'
      ) {
        loggerInstance = module.useLogger;
      } else {
        console.warn(
          '[LoggerUtils] Logger module did not export expected methods via `useLogger`. Falling back to console only.'
        );
      }
    }).catch(e => {
      console.error('[LoggerUtils] Failed to load logger module:', e);
    });
  }

  if (loggerInstance && typeof loggerInstance[level] === 'function') {
    loggerInstance[level](message, metadata);
  } else {
    console[level](message, metadata);
  }
}