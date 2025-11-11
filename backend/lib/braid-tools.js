/**
 * Braid Tools for OpenAI Function Calling
 * Converts Braid HIR modules into OpenAI tool definitions and executes them
 */
import { pathToFileURL } from 'url';

/**
 * Convert Braid HIR type to JSON Schema type
 */
function braidTypeToJsonSchema(braidType) {
  // Handle basic types
  const typeMap = {
    'String': 'string',
    'i32': 'number',
    'i64': 'number',
    'f32': 'number',
    'f64': 'number',
    'bool': 'boolean',
    'List': 'array',
    'Map': 'object'
  };
  
  return typeMap[braidType] || 'string'; // Default to string if unknown
}

/**
 * Parse Braid function parameters string into JSON Schema
 * Example: "company_size: i32, budget: i32, urgency: i32" 
 * Returns: { properties: {...}, required: [...] }
 */
function parseBraidParams(paramsString) {
  if (!paramsString || paramsString.trim() === '') {
    return { properties: {}, required: [] };
  }
  
  const properties = {};
  const required = [];
  
  const params = paramsString.split(',').map(p => p.trim());
  
  for (const param of params) {
    if (!param) continue;
    
    // Parse "name: Type" format
    const parts = param.split(':').map(p => p.trim());
    if (parts.length !== 2) continue;
    
    const [name, type] = parts;
    properties[name] = {
      type: braidTypeToJsonSchema(type),
      description: `Parameter of type ${type}`
    };
    required.push(name);
  }
  
  return { properties, required };
}

/**
 * Extract description from Braid function comments or metadata
 * For now, we'll generate a description from the function name
 */
function generateFunctionDescription(functionName, _fn) {
  // Convert snake_case to human readable
  const readable = functionName.replace(/_/g, ' ');
  return `Execute the ${readable} function`;
}

/**
 * Convert Braid HIR modules to OpenAI tool definitions
 * @param {Array} modules - Array of loaded Braid modules from loadBraidModules()
 * @returns {Array} Array of OpenAI tool definitions
 */
export function braidModulesToTools(modules) {
  const tools = [];
  
  for (const mod of modules) {
    if (mod.error || !mod.hir || !mod.hir.functions) continue;
    
    // Filter to only functions that have routes (are exposed via API)
    const exposedFunctions = mod.hir.functions.filter(fn => 
      mod.hir.routes?.some(route => route.function === fn.name)
    );
    
    for (const fn of exposedFunctions) {
      const schema = parseBraidParams(fn.params);
      
      tools.push({
        type: 'function',
        function: {
          name: fn.name,
          description: generateFunctionDescription(fn.name, fn),
          parameters: {
            type: 'object',
            properties: schema.properties,
            required: schema.required
          }
        },
        // Store metadata for execution
        _meta: {
          module: mod.file,
          jsPath: mod.jsPath,
          returnType: fn.return_type
        }
      });
    }
  }
  
  return tools;
}

/**
 * Execute a Braid function by name
 * @param {string} functionName - Name of the Braid function to execute
 * @param {object} args - Arguments to pass to the function
 * @param {Array} modules - Array of loaded Braid modules
 * @returns {Promise<any>} Function result
 */
export async function executeBraidFunction(functionName, args, modules) {
  console.log(`[Braid Tools] Executing ${functionName} with args:`, args);
  
  // Find the module containing this function
  let targetModule = null;
  let targetFunction = null;
  
  for (const mod of modules) {
    if (mod.error || !mod.hir) continue;
    
    targetFunction = mod.hir.functions.find(fn => fn.name === functionName);
    if (targetFunction) {
      targetModule = mod;
      break;
    }
  }
  
  if (!targetModule || !targetFunction) {
    throw new Error(`Function '${functionName}' not found in Braid modules`);
  }
  
  // Import the transpiled JS module
  let jsModule;
  try {
    jsModule = await import(pathToFileURL(targetModule.jsPath).href + `?t=${Date.now()}`);
  } catch (err) {
    throw new Error(`Failed to import transpiled module: ${err.message}`);
  }
  
  const transpiledFn = jsModule[functionName];
  if (!transpiledFn) {
    throw new Error(`Function '${functionName}' not found in transpiled module`);
  }
  
  // Extract arguments in the correct order based on function signature
  const paramNames = targetFunction.params
    ? targetFunction.params
        .split(',')
        .map(p => p.trim().split(':')[0].trim())
        .filter(name => name.length > 0)
    : [];
  
  const orderedArgs = paramNames.map(name => args[name]);
  
  // Execute the function
  try {
    const result = await transpiledFn(...orderedArgs);
    console.log(`[Braid Tools] Result from ${functionName}:`, result);
    return result;
  } catch (err) {
    console.error(`[Braid Tools] Execution error in ${functionName}:`, err);
    throw new Error(`Execution failed: ${err.message}`);
  }
}

/**
 * Get all available Braid tools for a specific category
 * @param {Array} modules - Array of loaded Braid modules
 * @param {string} category - Optional category filter (e.g., 'crm')
 * @returns {Array} Filtered OpenAI tool definitions
 */
export function getBraidToolsByCategory(modules, category = null) {
  const allTools = braidModulesToTools(modules);
  
  if (!category) return allTools;
  
  // Filter by module filename (e.g., crm_demo.braid -> 'crm')
  return allTools.filter(tool => 
    tool._meta.module.toLowerCase().includes(category.toLowerCase())
  );
}
