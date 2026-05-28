/**
 * projectionRuntimeErrors.js
 *
 * Error types for the Finance Ops Projection Runtime (Phase 2B-7).
 * See docs/architecture/finance/projection-runtime.md.
 */

export const PROJECTION_RUNTIME_ERROR_CODES = {
  // Invalid arguments, invalid worker, duplicate registration, illegal state.
  INVALID: 'PROJECTION_RUNTIME_INVALID',
  // A projection name was referenced that is not registered.
  NOT_FOUND: 'PROJECTION_NOT_FOUND',
};

/**
 * The single error type raised by the projection runtime (runner + store).
 * Carries a stable `code` from PROJECTION_RUNTIME_ERROR_CODES.
 */
export class ProjectionRuntimeError extends Error {
  constructor(message, code = PROJECTION_RUNTIME_ERROR_CODES.INVALID) {
    super(message);
    this.name = 'ProjectionRuntimeError';
    this.code = code;
  }
}

export default ProjectionRuntimeError;
