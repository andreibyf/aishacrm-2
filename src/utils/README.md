# Utility Modules

This directory contains reusable utility functions and modules that promote code reuse and consistency across the application.

## Frontend Utilities (`src/utils/`)

### devLogger.js
Environment-aware logging utility that only outputs in development mode.

**Usage:**
```javascript
import { logDev, warnDev, logError, createScopedLogger } from '@/utils/devLogger';

// Simple logging (dev only)
logDev('Debug message');
warnDev('Warning message');
logError('Error message'); // Always logged

// Scoped logging
const logger = createScopedLogger('MyComponent');
logger.log('Component initialized');
logger.error('Component error');
```

### userPermissions.js
Centralized user role and permission checking functions.

**Usage:**
```javascript
import { isSuperAdmin, isAdminOrSuperAdmin, getRoleHierarchy } from '@/utils/userPermissions';

if (isSuperAdmin(user)) {
  // Show admin controls
}

if (hasHigherRole(user.role, 'manager')) {
  // Allow manager actions
}
```

### validation.js
Common input validation functions for email, phone, URLs, UUIDs, etc.

**Usage:**
```javascript
import { isValidEmail, validatePassword, sanitizeString } from '@/utils/validation';

if (!isValidEmail(email)) {
  setError('Invalid email format');
}

const result = validatePassword(password);
if (!result.isValid) {
  setErrors(result.errors);
}

const safe = sanitizeString(userInput);
```

### navigationConfig.js
Centralized navigation configuration and module mappings.

**Usage:**
```javascript
import { navItems, moduleMapping, pagesAllowedWithoutCRM } from '@/utils/navigationConfig';

// Check if page requires CRM access
if (!pagesAllowedWithoutCRM.has(pageName)) {
  // Verify CRM access
}

// Get module ID for a page
const moduleId = moduleMapping[pageName];
```

## Backend Utilities (`backend/utils/`)

### logger.js
Structured logging with log levels for backend services.

**Usage:**
```javascript
import { createLogger, error, info, debug } from '../utils/logger.js';

const logger = createLogger('UserService');

logger.info('User created', { userId: user.id });
logger.error('Failed to create user', new Error('Database error'));
logger.debug('Processing user data', { data });
```

**Environment Variables:**
- `LOG_LEVEL`: Set to ERROR, WARN, INFO, or DEBUG (default: INFO in production, DEBUG in development)
- `NODE_ENV`: Set to 'production' or 'development'

### errorHandler.js
Standardized error handling for API routes with consistent response formats.

**Usage:**
```javascript
import { 
  asyncHandler, 
  validationError, 
  notFoundError,
  sendErrorResponse,
  ApiError 
} from '../utils/errorHandler.js';

// Wrap async routes
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw notFoundError('User');
  }
  res.json({ success: true, data: user });
}));

// Custom errors
throw new ApiError('Custom error', 400, 'CUSTOM_CODE');
throw validationError('Invalid input', { field: 'email' });
```

## Best Practices

### Logging
1. Use `logDev()` for debug information that's only needed during development
2. Use `logError()` for errors that should always be visible
3. Use scoped loggers to identify the source of log messages
4. Include relevant context in log metadata

### Validation
1. Validate user input on both frontend and backend
2. Use consistent validation functions across the codebase
3. Sanitize user input before displaying or storing
4. Provide clear error messages for validation failures

### Error Handling
1. Use `asyncHandler` wrapper for all async route handlers
2. Throw appropriate error types (validation, notFound, unauthorized, etc.)
3. Include relevant context in error details
4. Log server errors (5xx) for debugging

### Code Organization
1. Extract reusable logic into utility functions
2. Use JSDoc comments to document function parameters and return types
3. Keep utility functions pure and side-effect free when possible
4. Export only what's needed (prefer named exports)

## Adding New Utilities

When adding new utility functions:

1. Choose the appropriate module or create a new one if needed
2. Add JSDoc comments with parameter types and descriptions
3. Include usage examples in this README
4. Write unit tests for complex logic
5. Keep functions focused on a single responsibility
