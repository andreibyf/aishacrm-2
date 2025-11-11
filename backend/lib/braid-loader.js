/**
 * Braid Module Loader
 * Scans backend/modules/*.braid, validates, extracts HIR, transpiles to JS, and registers Express routes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(__dirname, '../modules');
const adapterPath = path.resolve(__dirname, '../../braid-llm-kit/tools/braid-adapter.js');
const transpilerPath = path.resolve(__dirname, '../../braid-llm-kit/tools/braid-transpile.js');

/**
 * Load all Braid modules and return HIR metadata + transpiled code
 * @returns {Array<{file: string, hir: object, jsModule: object, error?: string}>}
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
      
      // Transpile to JavaScript
      const jsPath = filePath.replace('.braid', '.transpiled.js');
      const transpileResult = spawnSync('node', [transpilerPath, '--file', filePath, '--output', jsPath], {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '../../braid-llm-kit')
      });
      
      if (transpileResult.status !== 0) {
        console.error(`[Braid Loader] Transpilation failed for ${file}:`, transpileResult.stderr);
        modules.push({ file, hir, error: `Transpilation failed: ${transpileResult.stderr}` });
        continue;
      }
      
      // Dynamically import transpiled module (async, but we'll handle it in registerBraidRoutes)
      modules.push({ file, hir, jsPath });
      console.log(`[Braid Loader] ✓ Loaded ${file}: ${hir.functions.length} functions, ${hir.routes.length} routes`);
    } catch (err) {
      console.error(`[Braid Loader] Invalid HIR output for ${file}:`, err.message);
      modules.push({ file, error: `Parse error: ${err.message}` });
    }
  }

  return modules;
}

/**
 * Register Braid routes in Express app with transpiled function handlers
 * @param {import('express').Application} app - Express app
 * @param {Array} modules - Array of loaded modules with HIR and jsPath
 */
export async function registerBraidRoutes(app, modules) {
  let routeCount = 0;

  for (const mod of modules) {
    if (mod.error || !mod.hir || !mod.hir.routes) continue;

    // Import transpiled JS module
    let jsModule;
    if (mod.jsPath) {
      try {
        jsModule = await import(pathToFileURL(mod.jsPath).href);
      } catch (err) {
        console.error(`[Braid Loader] Failed to import ${mod.jsPath}:`, err.message);
        continue;
      }
    }

    for (const route of mod.hir.routes) {
      const method = (route.method || 'GET').toLowerCase();
      const routePath = route.path || '/';
      const fn = mod.hir.functions.find(f => f.name === route.function);

      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        console.warn(`[Braid Loader] Unsupported HTTP method '${route.method}' for ${route.function}`);
        continue;
      }

      // Check if transpiled function exists
      const transpiledFn = jsModule?.[route.function];
      
      if (transpiledFn) {
        // Register working route with transpiled function
        app[method](routePath, async (req, res) => {
          try {
            // Map function parameters from request data
            // fn.params is a string like "input: String, name: String" from HIR
            // We need to parse it to extract parameter names
            const args = [];
            if (fn?.params && fn.params.length > 0) {
              // Parse params string: "input: String, name: String" -> ["input", "name"]
              const paramNames = fn.params
                .split(',')
                .map(p => p.trim().split(':')[0].trim())
                .filter(name => name.length > 0);
              
              console.log(`[Braid Loader] Mapping params for ${route.function}:`, paramNames);
              for (const paramName of paramNames) {
                // Try body first (POST/PUT/PATCH), then query (GET), then params (route params)
                const value = req.body?.[paramName] ?? req.query?.[paramName] ?? req.params?.[paramName];
                console.log(`[Braid Loader]   ${paramName} =`, value);
                args.push(value);
              }
            }
            
            console.log(`[Braid Loader] Calling ${route.function} with args:`, args);
            const result = await transpiledFn(...args);
            console.log(`[Braid Loader] Result from ${route.function}:`, result);
            res.json({ result });
          } catch (err) {
            console.error(`[Braid Loader] Error in ${route.function}:`, err);
            res.status(500).json({
              error: 'Execution Error',
              message: err.message,
              function: route.function
            });
          }
        });
        console.log(`[Braid Loader] ✓ Registered ${method.toUpperCase()} ${routePath} → ${route.function}() [TRANSPILED]`);
      } else {
        // Fallback to 501 stub if transpilation failed
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
        console.log(`[Braid Loader] ✓ Registered ${method.toUpperCase()} ${routePath} → ${route.function}() [STUB]`);
      }

      routeCount++;
    }
  }

  console.log(`[Braid Loader] Registered ${routeCount} Braid route(s)`);
  return routeCount;
}
