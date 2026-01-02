/**
 * Error handling type definitions
 * Provides type-safe error handling patterns
 */

export interface ErrorWithMessage {
  message: string;
  code?: string;
  statusCode?: number;
  stack?: string;
}

/**
 * Type guard to check if an error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if an error has a message property
 */
export function hasErrorMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (hasErrorMessage(error)) {
    return error.message;
  }
  return String(error);
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(error: unknown): { status: 'error'; message: string } {
  return {
    status: 'error',
    message: getErrorMessage(error)
  };
}
