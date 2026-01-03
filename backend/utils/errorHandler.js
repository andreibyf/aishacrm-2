/**
 * API Error Handling Utilities
 * 
 * Centralized error handling for backend API routes.
 * Provides consistent error responses and logging.
 * 
 * @module backend/utils/errorHandler
 */

import logger from '../lib/logger.js';

/**
 * Standard error response structure
 * 
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Always false for errors
 * @property {string} error - Error message
 * @property {string} [code] - Error code
 * @property {Object} [details] - Additional error details
 */

/**
 * HTTP status codes for common errors
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, statusCode = HttpStatus.INTERNAL_SERVER_ERROR, code = null, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Create a standardized error response
 * 
 * @param {string} message - Error message
 * @param {string} [code] - Error code
 * @param {Object} [details] - Additional error details
 * @returns {ErrorResponse} Formatted error response
 */
export function createErrorResponse(message, code = null, details = null) {
  const response = {
    success: false,
    error: message,
  };
  
  if (code) response.code = code;
  if (details) response.details = details;
  
  return response;
}

/**
 * Send an error response with appropriate status code
 * 
 * @param {Object} res - Express response object
 * @param {Error|ApiError} error - Error object
 * @param {number} [defaultStatus] - Default status code if not specified in error
 */
export function sendErrorResponse(res, error, defaultStatus = HttpStatus.INTERNAL_SERVER_ERROR) {
  const statusCode = error.statusCode || defaultStatus;
  const errorResponse = createErrorResponse(
    error.message || 'An unexpected error occurred',
    error.code,
    error.details
  );
  
  // Log error details for debugging
  if (statusCode >= 500) {
    logger.error({ err: error }, '[API Error]');
  }
  
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error handler wrapper for Express routes
 * Catches async errors and passes them to error handling middleware
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error handling middleware
 * Should be added at the end of middleware chain
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandlerMiddleware(err, req, res, next) {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }
  
  sendErrorResponse(res, err);
}

/**
 * Validation error helper
 * 
 * @param {string} message - Error message
 * @param {Object} [details] - Validation error details
 * @returns {ApiError} API error with BAD_REQUEST status
 */
export function validationError(message, details = null) {
  return new ApiError(message, HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', details);
}

/**
 * Not found error helper
 * 
 * @param {string} resource - Resource type that was not found
 * @returns {ApiError} API error with NOT_FOUND status
 */
export function notFoundError(resource = 'Resource') {
  return new ApiError(`${resource} not found`, HttpStatus.NOT_FOUND, 'NOT_FOUND');
}

/**
 * Unauthorized error helper
 * 
 * @param {string} [message] - Custom error message
 * @returns {ApiError} API error with UNAUTHORIZED status
 */
export function unauthorizedError(message = 'Unauthorized') {
  return new ApiError(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
}

/**
 * Forbidden error helper
 * 
 * @param {string} [message] - Custom error message
 * @returns {ApiError} API error with FORBIDDEN status
 */
export function forbiddenError(message = 'Forbidden') {
  return new ApiError(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
}

/**
 * Conflict error helper
 * 
 * @param {string} message - Error message
 * @returns {ApiError} API error with CONFLICT status
 */
export function conflictError(message) {
  return new ApiError(message, HttpStatus.CONFLICT, 'CONFLICT');
}
