/**
 * API Route Auditor
 * Discovers all routes in the application and compares with Swagger documentation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract routes from an Express router or app
 * @param {Object} router - Express router or app
 * @param {String} basePath - Base path for the routes
 * @returns {Array} Array of route objects {method, path, file}
 */
function extractRoutes(router, basePath = '') {
  const routes = [];

  if (!router || !router.stack) {
    return routes;
  }

  router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Route middleware
      const path = basePath + middleware.route.path;
      const methods = Object.keys(middleware.route.methods).map((m) => m.toUpperCase());

      methods.forEach((method) => {
        routes.push({
          method,
          path,
          file: null, // Will be populated by file scan
        });
      });
    } else if (middleware.name === 'router') {
      // Nested router
      const nestedPath = middleware.regexp
        .source.replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\^/g, '')
        .replace(/\$/g, '')
        .replace(/\\/g, '');

      const cleanPath = basePath + nestedPath.split('?')[0];
      const nested = extractRoutes(middleware.handle, cleanPath);
      routes.push(...nested);
    }
  });

  return routes;
}

/**
 * Scan route files for @openapi documentation tags
 * @returns {Promise<Object>} Map of routes with Swagger documentation status
 */
async function scanRouteFiles() {
  const routesDir = path.join(__dirname, '..', 'routes');
  const files = await fs.readdir(routesDir);
  const jsFiles = files.filter((f) => f.endsWith('.js') && !f.startsWith('_'));

  const routeInfo = {};

  for (const file of jsFiles) {
    const filePath = path.join(routesDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract route definitions (router.get, router.post, etc.)
    const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = routeRegex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const key = `${method} ${routePath}`;

      // Check if this route has @openapi documentation
      // Look backwards from the match position for @openapi tag
      const beforeRoute = content.substring(Math.max(0, match.index - 2000), match.index);
      const hasSwagger = beforeRoute.includes('@openapi');

      // Extract handler function name if possible
      const handlerMatch = content
        .substring(match.index, match.index + 500)
        .match(/\((req,\s*res[^)]*)\)\s*=>\s*{|async\s+\((req,\s*res[^)]*)\)|function\s+(\w+)/);

      routeInfo[key] = {
        file,
        method,
        path: routePath,
        hasSwagger,
        handler: handlerMatch ? handlerMatch[0].substring(0, 50) + '...' : 'unknown',
      };
    }
  }

  return routeInfo;
}

/**
 * Audit all API routes and return documentation coverage report
 * @returns {Promise<Object>} Audit report
 */
export async function auditAPIRoutes() {
  try {
    const routeInfo = await scanRouteFiles();

    const stats = {
      totalRoutes: Object.keys(routeInfo).length,
      documented: 0,
      undocumented: 0,
      coverage: 0,
      byFile: {},
      undocumentedRoutes: [],
    };

    Object.entries(routeInfo).forEach(([key, info]) => {
      if (info.hasSwagger) {
        stats.documented++;
      } else {
        stats.undocumented++;
        stats.undocumentedRoutes.push({
          method: info.method,
          path: info.path,
          file: info.file,
        });
      }

      // Group by file
      if (!stats.byFile[info.file]) {
        stats.byFile[info.file] = {
          total: 0,
          documented: 0,
          undocumented: 0,
        };
      }

      stats.byFile[info.file].total++;
      if (info.hasSwagger) {
        stats.byFile[info.file].documented++;
      } else {
        stats.byFile[info.file].undocumented++;
      }
    });

    stats.coverage = stats.totalRoutes > 0 ? (stats.documented / stats.totalRoutes) * 100 : 0;

    // Calculate coverage per file
    Object.keys(stats.byFile).forEach((file) => {
      const fileStats = stats.byFile[file];
      fileStats.coverage = fileStats.total > 0 ? (fileStats.documented / fileStats.total) * 100 : 0;
    });

    return stats;
  } catch (error) {
    console.error('[API Auditor] Error auditing routes:', error);
    throw error;
  }
}

/**
 * Generate Swagger documentation template for an undocumented route
 * @param {Object} route - Route object {method, path, file}
 * @returns {String} Swagger documentation template
 */
export function generateSwaggerTemplate(route) {
  const { method, path, file } = route;
  const methodLower = method.toLowerCase();

  // Infer tag from file name
  const tag = file.replace('.js', '').replace('.v2', '').replace(/-/g, ' ');

  // Infer parameters from path
  const pathParams = [];
  const pathParamRegex = /:(\w+)/g;
  let match;
  while ((match = pathParamRegex.exec(path)) !== null) {
    pathParams.push(match[1]);
  }

  const paramDocs = pathParams
    .map(
      (param) => `
 *       - in: path
 *         name: ${param}
 *         required: true
 *         schema:
 *           type: string
 *         description: ${param.charAt(0).toUpperCase() + param.slice(1)} identifier`,
    )
    .join('');

  // Infer summary from path and method
  const summary = `${method} ${path}`;

  return `/**
 * @openapi
 * ${path}:
 *   ${methodLower}:
 *     summary: ${summary}
 *     tags: [${tag}]${pathParams.length > 0 ? '\n *     parameters:' + paramDocs : ''}
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */`;
}
