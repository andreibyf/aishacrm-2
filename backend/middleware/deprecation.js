/**
 * API v1 Deprecation Middleware
 * 
 * Adds deprecation headers to v1 API responses per Phase 4 spec:
 * - X-API-Version: v1
 * - X-API-Deprecation-Date: When v1 will stop receiving updates
 * - X-API-Sunset-Date: When v1 will be removed
 * - X-Migration-Guide: Link to migration docs
 * - Link: Alternate v2 endpoint
 */

// Configuration
const DEPRECATION_DATE = '2027-02-01';  // Stop receiving updates
const SUNSET_DATE = '2027-08-01';       // Complete removal
const MIGRATION_GUIDE_URL = 'https://docs.aishacrm.com/api/v2/migration';

// v1 to v2 route mapping
const V2_ROUTE_MAP = {
  '/api/opportunities': '/api/v2/opportunities',
  '/api/activities': '/api/v2/activities',
  '/api/contacts': '/api/v2/contacts',
  '/api/accounts': '/api/v2/accounts',
  '/api/leads': '/api/v2/leads',
  '/api/reports': '/api/v2/reports',
  '/api/workflows': '/api/v2/workflows',
  '/api/documents': '/api/v2/documents',
};

/**
 * Check if a path matches a v1 route that has a v2 alternative
 */
function getV2Alternative(path) {
  for (const [v1Path, v2Path] of Object.entries(V2_ROUTE_MAP)) {
    if (path.startsWith(v1Path)) {
      // Replace the v1 prefix with v2
      return path.replace(v1Path, v2Path);
    }
  }
  return null;
}

/**
 * Check if this is a v1 API path (not already v2)
 */
function isV1ApiPath(path) {
  return path.startsWith('/api/') && 
         !path.startsWith('/api/v2/') && 
         !path.startsWith('/api-docs');
}

/**
 * Deprecation warning middleware
 * Adds headers to all v1 API responses when a v2 alternative exists
 */
export function deprecationMiddleware(req, res, next) {
  // Only apply to v1 API routes
  if (!isV1ApiPath(req.path)) {
    return next();
  }

  // Check if there's a v2 alternative
  const v2Alternative = getV2Alternative(req.path);
  
  if (v2Alternative) {
    // Add deprecation headers
    res.set('X-API-Version', 'v1');
    res.set('X-API-Deprecation-Date', DEPRECATION_DATE);
    res.set('X-API-Sunset-Date', SUNSET_DATE);
    res.set('X-Migration-Guide', MIGRATION_GUIDE_URL);
    res.set('Link', `<${v2Alternative}>; rel="alternate"`);

    // Add warning header for developer visibility
    res.set('Warning', `299 - "API v1 is deprecated. Migrate to v2 by ${SUNSET_DATE}. See: ${MIGRATION_GUIDE_URL}"`);
  } else {
    // Still add version header for all v1 routes
    res.set('X-API-Version', 'v1');
  }

  next();
}

/**
 * Middleware to log v1 usage for analytics
 * Helps track migration progress
 */
export function v1UsageLogger(req, res, next) {
  if (!isV1ApiPath(req.path)) {
    return next();
  }

  const v2Alternative = getV2Alternative(req.path);
  
  if (v2Alternative) {
    // Log v1 usage for routes with v2 alternatives
    // This helps track migration progress
    const logData = {
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      v2Alternative,
      tenantId: req.query?.tenant_id || req.body?.tenant_id || 'unknown',
      userAgent: req.get('User-Agent'),
    };

    // Log at debug level to avoid noise
    if (process.env.LOG_V1_USAGE === 'true') {
      logger.debug('[v1-usage]', JSON.stringify(logData));
    }
  }

  next();
}

/**
 * Express middleware factory
 * Use: app.use(createDeprecationMiddleware())
 */
export function createDeprecationMiddleware(options = {}) {
  const {
    logUsage = process.env.LOG_V1_USAGE === 'true',
    customRouteMap = {},
  } = options;

  // Merge custom route map
  Object.assign(V2_ROUTE_MAP, customRouteMap);

  return (req, res, next) => {
    deprecationMiddleware(req, res, () => {
      if (logUsage) {
        v1UsageLogger(req, res, next);
      } else {
        next();
      }
    });
  };
}

export default createDeprecationMiddleware;
