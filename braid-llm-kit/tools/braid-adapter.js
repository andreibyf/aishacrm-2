// braid-adapter.js — Production adapter bridging Braid to backend routes
// Transpiles .braid files, enforces policies, handles errors, caches results
"use strict";

/* eslint-env node */
/* global Buffer, process */

import fs from 'fs/promises';
import path from 'path';
import { parse } from './braid-parse.js';
import { transpileToJS } from './braid-transpile.js';
import { CRM_POLICIES } from './braid-rt.js';

// Result cache for compiled Braid functions (prevents re-transpilation)
const compiledCache = new Map();
const resultCache = new Map();

/**
 * Execute a Braid function with policy enforcement and tenant isolation
 * @param {string} braidFilePath - Path to .braid file
 * @param {string} functionName - Function to execute
 * @param {Object} policy - Security policy (use CRM_POLICIES.*)
 * @param {Object} deps - Effect dependencies {http, clock, fs, rng}
 * @param {Array} args - Function arguments
 * @param {Object} options - {cache: boolean, timeout: number}
 * @returns {Promise<Result>} Ok(value) or Err(error)
 */
export async function executeBraid(braidFilePath, functionName, policy, deps, args = [], options = {}) {
  const { cache = true, timeout = policy?.max_execution_ms || 30000 } = options;
  
  try {
    // 1. Generate cache key
    const cacheKey = `${braidFilePath}:${functionName}:${JSON.stringify(args)}`;
    if (cache && resultCache.has(cacheKey)) {
      return resultCache.get(cacheKey);
    }
    
    // 2. Load and transpile (with caching)
    let compiledModule;
    if (compiledCache.has(braidFilePath)) {
      compiledModule = compiledCache.get(braidFilePath);
    } else {
      const braidSource = await fs.readFile(braidFilePath, 'utf8');
      const ast = parse(braidSource, braidFilePath);
      
      // Resolve absolute path to braid-rt.js for data URL imports
      const runtimePath = path.resolve(path.dirname(braidFilePath), '../../tools/braid-rt.js');
      const runtimeUrl = `file:///${runtimePath.replace(/\\/g, '/')}`;
      
      const { code } = transpileToJS(ast, { 
        policy, 
        source: braidFilePath,
        typescript: false,
        runtimeImport: runtimeUrl
      });
      // Removed debug-time compiled code preview logging
      
      // Dynamic import using data URL (Node.js 18+)
      const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
      compiledModule = await import(dataUrl);
      compiledCache.set(braidFilePath, compiledModule);
    }
    
    // 3. Execute with timeout
    const fn = compiledModule[functionName];
    if (!fn) {
      throw new Error(`Function '${functionName}' not found in ${braidFilePath}`);
    }
    
    // Check if function is effectful (async) by inspecting its constructor name
    // Effectful functions are transpiled as async and expect (policy, deps, ...args)
    // Pure functions don't expect policy/deps in their signature
    const isEffectful = fn.constructor.name === 'AsyncFunction';
    
    const result = await Promise.race([
      isEffectful ? fn(policy, deps, ...args) : fn(...args),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`[BRAID_TIMEOUT] ${functionName} exceeded ${timeout}ms`)), timeout)
      )
    ]);
    
    // 4. Cache result if successful
    if (cache && result?.tag === 'Ok') {
      resultCache.set(cacheKey, result);
    }
    
    return result;
    
  } catch (error) {
    // 5. Error recovery with audit logging
    const audit = {
      file: braidFilePath,
      function: functionName,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    if (policy?.audit_log) {
      console.error(`[BRAID_ERROR] ${JSON.stringify(audit)}`);
    }
    
    return {
      tag: 'Err',
      error: {
        type: 'BraidExecutionError',
        message: error.message,
        stack: error.stack
      }
    };
  }
}

/**
 * Load Braid function as OpenAI tool schema
 * @param {string} braidFilePath - Path to .braid file
 * @param {string} functionName - Function name
 * @returns {Promise<Object>} OpenAI tool definition
 */
export async function loadToolSchema(braidFilePath, functionName) {
  const braidSource = await fs.readFile(braidFilePath, 'utf8');
  const ast = parse(braidSource, braidFilePath);
  
  const fnDecl = ast.items.find(it => it.type === 'FnDecl' && it.name === functionName);
  if (!fnDecl) {
    throw new Error(`Function '${functionName}' not found in ${braidFilePath}`);
  }
  
  // Extract parameter schema from Braid function signature
  const parameters = {
    type: 'object',
    properties: {},
    required: []
  };
  
  for (const param of fnDecl.params) {
    const paramName = param.name;
    const paramType = param.type?.base || 'String';
    
    // Map Braid types to JSON Schema types
    const typeMap = {
      'String': 'string',
      'Number': 'number',
      'Boolean': 'boolean',
      'Array': 'array',
      'Object': 'object'
    };
    
    parameters.properties[paramName] = {
      type: typeMap[paramType] || 'string',
      description: `Parameter ${paramName} of type ${paramType}`
    };
    
    parameters.required.push(paramName);
  }
  
  // Build tool schema
  return {
    type: 'function',
    function: {
      name: functionName,
      description: `Braid function from ${path.basename(braidFilePath)}. Effects: ${fnDecl.effects.map(e=>`!${e}`).join(', ')}. Returns: ${fnDecl.ret.text}`,
      parameters
    }
  };
}

/**
 * Clear compilation and result caches
 */
export function clearCache() {
  compiledCache.clear();
  resultCache.clear();
}

/**
 * Get audit log for debugging
 */
export { getAuditLog } from './braid-rt.js';

/**
 * Pre-configured executors for common CRM operations
 */
export const CRM_TOOLS = {
  async fetchSnapshot(tenant, scope = 'all', limit = 5, deps) {
    const braidFile = path.join(process.cwd(), 'braid-llm-kit', 'examples', '09_route_endpoint.braid');
    return await executeBraid(
      braidFile,
      'fetchSnapshot',
      CRM_POLICIES.READ_ONLY,
      deps,
      [tenant, scope, limit],
      { cache: true }
    );
  },
  
  async createLead(name, email, tenant, deps) {
    const braidFile = path.join(process.cwd(), 'braid-llm-kit', 'examples', '10_create_lead.braid');
    return await executeBraid(
      braidFile,
      'createLead',
      CRM_POLICIES.WRITE_OPERATIONS,
      deps,
      [name, email, tenant],
      { cache: false }
    );
  },
  
  async updateAccountRevenue(accountId, newRevenue, tenant, deps) {
    const braidFile = path.join(process.cwd(), 'braid-llm-kit', 'examples', '11_update_account.braid');
    return await executeBraid(
      braidFile,
      'updateAccountRevenue',
      CRM_POLICIES.WRITE_OPERATIONS,
      deps,
      [accountId, newRevenue, tenant],
      { cache: false }
    );
  }
};
