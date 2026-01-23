/**
 * Custom Error Classes
 *
 * Centralized error classes for consistent error handling across the application.
 * These errors are caught by the global error handler middleware and converted
 * to appropriate HTTP responses.
 */

/**
 * Base class for all application errors.
 * Extends Error with additional properties for HTTP status codes and error codes.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      status: 'error',
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * 400 Bad Request - Invalid input or missing required fields
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

/**
 * 400 Validation Error - Invalid input data
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', id = null) {
    const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.resourceId = id;
  }
}

/**
 * 409 Conflict - Resource already exists or state conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * 422 Unprocessable Entity - Semantic errors in the request
 */
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity') {
    super(message, 422, 'UNPROCESSABLE_ENTITY');
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * 500 Internal Server Error - Unexpected errors
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * 502 Bad Gateway - External service error
 */
export class ExternalServiceError extends AppError {
  constructor(service = 'External service', message = 'Service unavailable') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Database-specific error - Wraps Supabase/PostgreSQL errors
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database error', originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;

    // Handle common PostgreSQL error codes
    if (originalError?.code) {
      switch (originalError.code) {
        case '23505': // unique_violation
          this.statusCode = 409;
          this.code = 'DUPLICATE_ENTRY';
          this.message = 'Record already exists';
          break;
        case '23503': // foreign_key_violation
          this.statusCode = 400;
          this.code = 'FOREIGN_KEY_VIOLATION';
          this.message = 'Referenced record does not exist';
          break;
        case '23502': // not_null_violation
          this.statusCode = 400;
          this.code = 'NULL_VIOLATION';
          break;
        case 'PGRST116': // PostgREST - no rows found
          this.statusCode = 404;
          this.code = 'NOT_FOUND';
          this.message = 'Record not found';
          break;
      }
    }
  }
}

/**
 * Helper function to wrap Supabase errors
 */
export function handleSupabaseError(error, context = '') {
  if (!error) return null;

  const prefix = context ? `${context}: ` : '';

  // Check for PostgREST "no rows" error (not actually an error in many cases)
  if (error.code === 'PGRST116') {
    return new NotFoundError('Record');
  }

  return new DatabaseError(`${prefix}${error.message}`, error);
}

/**
 * Helper to assert a condition or throw an error
 */
export function assertOrThrow(condition, ErrorClass, ...args) {
  if (!condition) {
    throw new ErrorClass(...args);
  }
}

/**
 * Helper to check required fields and throw ValidationError if missing
 */
export function requireFields(obj, fields, context = '') {
  const missing = fields.filter(field => obj[field] === undefined || obj[field] === null || obj[field] === '');
  if (missing.length > 0) {
    const prefix = context ? `${context}: ` : '';
    throw new ValidationError(`${prefix}Missing required fields: ${missing.join(', ')}`, { missing });
  }
}
