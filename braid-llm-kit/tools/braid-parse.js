// braid-parse.js — AiSHA re-export from core
// The real parser lives in ../core/braid-parse.js.
// This file re-exports it so existing imports (braid-adapter.js, braid-transpile.js,
// __tests__/*.test.js, backend/lib/braid/analysis.js) continue to work unchanged.
"use strict";

export { parse } from '../core/braid-parse.js';
