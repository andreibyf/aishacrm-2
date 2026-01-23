/**
 * Centralized Error Handler Middleware
 *
 * This middleware catches all errors thrown in route handlers and converts them
 * to consistent HTTP responses. It should be registered after all routes.
 *
 * Usage:
 *   // In server.js, after all routes:
 *   import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */

import logger from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

/**
 * Determines if we're in development/test mode
 */
const isDevelopment = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' || env === 'test';
};

/**
 * Sanitizes error messages for production
 * Removes sensitive information like stack traces and internal details
 */
const sanitizeErrorMessage = (error) => {
  // In development, return the full message
  if (isDevelopment()) {
    return error.message;
  }

  // In production, return generic messages for non-operational errors
  if (!error.isOperational) {
    return 'An unexpected error occurred';
  }

  return error.message;
};

/**
 * Formats the error response based on the error type
 */
const formatErrorResponse = (error) => {
  const response = {
    status: 'error',
    message: sanitizeErrorMessage(error),
  };

  // Add error code if available
  if (error.code) {
    response.code = error.code;
  }

  // Add validation details if available
  if (error.details) {
    response.details = error.details;
  }

  // Add retry-after header info for rate limiting
  if (error.retryAfter) {
    response.retryAfter = error.retryAfter;
  }

  // Add stack trace in development
  if (isDevelopment() && error.stack) {
    response.stack = error.stack.split('\n').slice(0, 5);
  }

  return response;
};

/**
 * Logs the error with appropriate level based on status code
 */
const logError = (error, req) => {
  const logData = {
    method: req.method,
    path: req.path,
    statusCode: error.statusCode || 500,
    errorCode: error.code,
    message: error.message,
    userId: req.user?.id,
    tenantId: req.tenant?.id,
  };

  // Add request body for POST/PUT/PATCH (excluding sensitive fields)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const sanitizedBody = { ...req.body };
    // Remove sensitive fields
    delete sanitizedBody.password;
    delete sanitizedBody.token;
    delete sanitizedBody.apiKey;
    delete sanitizedBody.secret;
    logData.body = sanitizedBody;
  }

  // Add stack trace for server errors
  if (error.statusCode >= 500 || !error.isOperational) {
    logData.stack = error.stack;
  }

  // Log based on severity
  if (error.statusCode >= 500) {
    logger.error('Server error:', logData);
  } else if (error.statusCode >= 400) {
    logger.warn('Client error:', logData);
  } else {
    logger.info('Error:', logData);
  }
};

/**
 * Main error handler middleware
 * Must have 4 parameters for Express to recognize it as an error handler
 */
export const errorHandler = (error, req, res, _next) => {
  // Prevent double-sending responses
  if (res.headersSent) {
    logger.warn('Headers already sent, skipping error handler', {
      path: req.path,
      error: error.message,
    });
    return;
  }

  // Normalize error to AppError format
  let normalizedError = error;

  // Handle non-AppError errors
  if (!(error instanceof AppError)) {
    // Handle JSON parsing errors
    if (error.type === 'entity.parse.failed') {
      normalizedError = {
        statusCode: 400,
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
        isOperational: true,
      };
    }
    // Handle payload too large
    else if (error.type === 'entity.too.large') {
      normalizedError = {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large',
        isOperational: true,
      };
    }
    // Handle Multer file upload errors
    else if (error.code === 'LIMIT_FILE_SIZE') {
      normalizedError = {
        statusCode: 413,
        code: 'FILE_TOO_LARGE',
        message: 'Uploaded file exceeds size limit',
        isOperational: true,
      };
    }
    // Handle generic errors
    else {
      normalizedError = {
        statusCode: error.statusCode || error.status || 500,
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
        isOperational: false,
        stack: error.stack,
      };
    }
  }

  // Log the error
  logError(normalizedError, req);

  // Set response status and headers
  const statusCode = normalizedError.statusCode || 500;
  res.status(statusCode);

  // Add retry-after header for rate limiting
  if (normalizedError.retryAfter) {
    res.set('Retry-After', String(normalizedError.retryAfter));
  }

  // Send error response
  res.json(formatErrorResponse(normalizedError));
};

/**
 * 404 Not Found handler for unmatched routes
 * Should be registered before the main error handler
 */
export const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
};

/**
 * Async route wrapper that catches errors and forwards them to the error handler
 *
 * Usage:
 *   router.get('/example', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json({ status: 'success', data });
 *   }));
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Wraps an existing route handler to use the error handler
 * Useful for gradually migrating existing routes
 */
export const wrapHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

export default errorHandler;
