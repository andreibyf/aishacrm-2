/**
 * Braid Module Loader
 * Scans backend/modules/*.braid, validates, extracts HIR, and registers Express routes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(__dirname, '../modules');
const adapterPath = path.resolve(__dirname, '../../braid-llm-kit/tools/braid-adapter.js');

/**
 * Load all Braid modules and return HIR metadata
 * @returns {Array<{file: string, hir: object, error?: string}>}
 */
export function loadBraidModules() {
  if (!fs.existsSync(modulesDir)) {
    console.warn(`[Braid Loader] Module directory not found: ${modulesDir}`);
    return [];
  }

  const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.braid'));
  const modules = [];

  for (const file of files) {
    const filePath = path.join(modulesDir, file);
    console.log(`[Braid Loader] Processing ${file}...`);

    // Run adapter (check + HIR extraction)
    const result = spawnSync('node', [adapterPath, '--file', filePath], {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '../../braid-llm-kit')
    });

    if (result.status !== 0) {
      console.error(`[Braid Loader] Failed to load ${file}:`, result.stderr || result.stdout);
      modules.push({ file, error: result.stderr || 'Unknown error' });
      continue;
    }

    try {
      const hir = JSON.parse(result.stdout);
      modules.push({ file, hir });
      console.log(`[Braid Loader] ✓ Loaded ${file}: ${hir.functions.length} functions, ${hir.routes.length} routes`);
    } catch (err) {
      console.error(`[Braid Loader] Invalid HIR output for ${file}:`, err.message);
      modules.push({ file, error: `Parse error: ${err.message}` });
    }
  }

  return modules;
}

/**
 * Register Braid routes in Express app
 * @param {import('express').Application} app - Express app
 * @param {Array} modules - Array of loaded modules with HIR
 */
export function registerBraidRoutes(app, modules) {
  let routeCount = 0;

  for (const mod of modules) {
    if (mod.error || !mod.hir || !mod.hir.routes) continue;

    for (const route of mod.hir.routes) {
      const method = (route.method || 'GET').toLowerCase();
      const routePath = route.path || '/';
      const fn = mod.hir.functions.find(f => f.name === route.function);

      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        console.warn(`[Braid Loader] Unsupported HTTP method '${route.method}' for ${route.function}`);
        continue;
      }

      // Register stub route (501 Not Implemented until transpiler ready)
      app[method](routePath, (req, res) => {
        res.status(501).json({
          error: 'Not Implemented',
          message: `Braid function '${route.function}' from ${mod.file} is registered but not yet executable`,
          function: route.function,
          effects: fn?.effects || [],
          params: fn?.params || '',
          module: mod.file
        });
      });

      routeCount++;
      console.log(`[Braid Loader] ✓ Registered ${method.toUpperCase()} ${routePath} → ${route.function}()`);
    }
  }

  console.log(`[Braid Loader] Registered ${routeCount} Braid route(s)`);
  return routeCount;
}
