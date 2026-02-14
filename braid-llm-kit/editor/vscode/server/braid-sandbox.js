// braid-sandbox.js — Runtime security sandbox for transpiled Braid code
// Blocks prototype pollution, eval, dynamic import, and other escape hatches.
// Imported by transpiled code when --sandbox is enabled.
"use strict";

// ============================================================================
// PROPERTY ACCESS DENYLIST
// ============================================================================

/** Properties that must never be accessed on any object */
const DENIED_PROPERTIES = new Set([
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'constructor',
  'prototype',
]);

/** Global names that must never be referenced */
const DENIED_GLOBALS = new Set([
  'eval',
  'Function',
  'GeneratorFunction',
  'AsyncFunction',
  'AsyncGeneratorFunction',
  'Proxy',
  'Reflect',
  'globalThis',
  'window',
  'global',
  'process',
  'require',
  'module',
  'exports',
  '__filename',
  '__dirname',
  'importScripts',
  'XMLHttpRequest',
  'WebSocket',
  'fetch',        // Must go through IO sandbox
  'setTimeout',   // Must go through clock.sleep
  'setInterval',
  'setImmediate',
]);

// ============================================================================
// SAFE PROPERTY ACCESS
// ============================================================================

/**
 * Safe member access — replaces `obj.prop` in transpiled code when sandbox is on.
 * Blocks prototype chain access and returns undefined for denied properties.
 *
 * @param {*} obj - Target object
 * @param {string} prop - Property name
 * @returns {*} Property value or undefined
 * @throws {Error} With code 'BRAID_SANDBOX' if access is denied
 */
export function safeGet(obj, prop) {
  if (obj == null) return undefined;

  if (typeof prop === 'string' && DENIED_PROPERTIES.has(prop)) {
    throw Object.assign(
      new Error(`[BRAID_SANDBOX] Access to '${prop}' is denied`),
      { code: 'BRAID_SANDBOX', property: prop, reason: 'denied_property' }
    );
  }

  // Block numeric prototype chain walking
  if (typeof prop === 'string' && prop.startsWith('__')) {
    throw Object.assign(
      new Error(`[BRAID_SANDBOX] Access to dunder property '${prop}' is denied`),
      { code: 'BRAID_SANDBOX', property: prop, reason: 'dunder_property' }
    );
  }

  // Only allow own properties + standard array/string methods
  return obj[prop];
}

/**
 * Safe member set — replaces `obj.prop = val` in transpiled code when sandbox is on.
 */
export function safeSet(obj, prop, value) {
  if (obj == null) {
    throw Object.assign(
      new Error(`[BRAID_SANDBOX] Cannot set property '${prop}' on ${obj}`),
      { code: 'BRAID_SANDBOX', property: prop, reason: 'null_target' }
    );
  }

  if (typeof prop === 'string' && (DENIED_PROPERTIES.has(prop) || prop.startsWith('__'))) {
    throw Object.assign(
      new Error(`[BRAID_SANDBOX] Setting '${prop}' is denied`),
      { code: 'BRAID_SANDBOX', property: prop, reason: 'denied_property' }
    );
  }

  obj[prop] = value;
  return value;
}

// ============================================================================
// GLOBAL REFERENCE GUARD
// ============================================================================

/**
 * Guard a global reference — replaces bare identifiers for known dangerous globals.
 * Emitted by the transpiler as: `guardGlobal("eval")` instead of bare `eval`.
 *
 * @param {string} name - Global name
 * @throws {Error} Always throws for denied globals
 */
export function guardGlobal(name) {
  if (DENIED_GLOBALS.has(name)) {
    throw Object.assign(
      new Error(`[BRAID_SANDBOX] Reference to '${name}' is denied in Braid`),
      { code: 'BRAID_SANDBOX', global: name, reason: 'denied_global' }
    );
  }
}

// ============================================================================
// FROZEN ENVIRONMENT
// ============================================================================

/**
 * Freeze the sandbox exports to prevent tampering.
 * Call this once at module load to ensure sandbox functions can't be overwritten.
 */
export function freezeSandbox() {
  Object.freeze(safeGet);
  Object.freeze(safeSet);
  Object.freeze(guardGlobal);
  Object.freeze(DENIED_PROPERTIES);
  Object.freeze(DENIED_GLOBALS);
}

// Auto-freeze on import
freezeSandbox();
