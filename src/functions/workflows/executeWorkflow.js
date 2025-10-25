/**
 * Deprecated: executeWorkflow (Deno)
 * This legacy serverless function depended on the Base44 SDK.
 * It has been replaced by the backend route: POST /api/workflows/execute
 * Please call executeWorkflow via src/api/functions.js which proxies to the backend in local dev.
 */

export default function deprecatedExecuteWorkflow() {
  throw new Error('Deprecated: Use backend POST /api/workflows/execute instead of the Deno function.');
}
