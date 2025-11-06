# Code Refactoring Guide

This guide provides best practices and patterns for improving code quality across the Aisha CRM codebase.

## Table of Contents
- [Logging Best Practices](#logging-best-practices)
- [Error Handling](#error-handling)
- [Input Validation](#input-validation)
- [Code Organization](#code-organization)
- [Naming Conventions](#naming-conventions)
- [Security Best Practices](#security-best-practices)

## Logging Best Practices

### Frontend Logging

Use the `devLogger` utility for environment-aware logging:

```javascript
import { logDev, warnDev, logError, createScopedLogger } from '@/utils/devLogger';

// ❌ Bad: Logs always appear in production
console.log('Debug info:', data);

// ✅ Good: Only logs in development
logDev('Debug info:', data);

// ✅ Good: Use scoped logger for module-specific logs
const logger = createScopedLogger('ContactForm');
logger.log('Form initialized');
logger.error('Validation failed');
```

### Backend Logging

Use the backend logger utility for structured logging:

```javascript
import { createLogger, info, error, debug } from '../utils/logger.js';

const logger = createLogger('UserService');

// ❌ Bad: Inconsistent logging
console.log('User created');
console.error('Error:', err);

// ✅ Good: Structured logging with levels
logger.info('User created', { userId: user.id });
logger.error('Failed to create user', error);
logger.debug('Processing data', { count: items.length });
```

**Environment Variables:**
- Set `LOG_LEVEL=DEBUG` in development
- Set `LOG_LEVEL=INFO` in production
- Set `LOG_LEVEL=ERROR` to only show errors

### When to Use Each Log Level

- **ERROR**: Application errors, database failures, critical issues
- **WARN**: Deprecated features, fallback behavior, unusual but handled situations
- **INFO**: Important application events (user login, data changes, service start)
- **DEBUG**: Detailed diagnostic information (only in development)

## Error Handling

### API Error Handling

Use standardized error handling for consistent API responses:

```javascript
import { 
  asyncHandler, 
  validationError, 
  notFoundError,
  unauthorizedError 
} from '../utils/errorHandler.js';

// ❌ Bad: Inconsistent error handling
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Good: Standardized error handling
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw notFoundError('User');
  }
  res.json({ success: true, data: user });
}));
```

### Frontend Error Handling

```javascript
// ❌ Bad: Silent failures
try {
  await saveData(data);
} catch (err) {
  // Nothing happens
}

// ✅ Good: User feedback + logging
try {
  await saveData(data);
  toast.success('Data saved successfully');
} catch (err) {
  logError('Failed to save data', err);
  toast.error('Failed to save data. Please try again.');
}
```

## Input Validation

### Using Validation Utilities

```javascript
import { isValidEmail, validatePassword, isNonEmptyString } from '@/utils/validation';

// ❌ Bad: Inconsistent validation
function validateForm(data) {
  if (!data.email.includes('@')) {
    return 'Invalid email';
  }
  if (data.password.length < 8) {
    return 'Password too short';
  }
}

// ✅ Good: Reusable validation
function validateForm(data) {
  if (!isValidEmail(data.email)) {
    return { valid: false, errors: ['Invalid email format'] };
  }
  
  const passwordCheck = validatePassword(data.password);
  if (!passwordCheck.isValid) {
    return { valid: false, errors: passwordCheck.errors };
  }
  
  return { valid: true };
}
```

### Sanitizing User Input

```javascript
import { sanitizeString } from '@/utils/validation';

// ❌ Bad: Potential XSS vulnerability
const displayName = userInput;

// ✅ Good: Sanitized input
const displayName = sanitizeString(userInput);
```

## Code Organization

### Breaking Down Large Files

**Before:** Single 3,000-line file
```javascript
// pages/Dashboard.jsx (3000+ lines)
function Dashboard() {
  // All logic, components, and utilities in one file
}
```

**After:** Modular structure
```
pages/
  Dashboard.jsx (200 lines - main component)
components/dashboard/
  DashboardHeader.jsx
  DashboardStats.jsx
  DashboardCharts.jsx
utils/dashboard/
  dashboardHelpers.js
  dashboardConstants.js
```

### Extracting Reusable Logic

```javascript
// ❌ Bad: Duplicate logic across files
// In ContactForm.jsx
const handleSubmit = async () => {
  if (!data.tenant_id) {
    data.tenant_id = user.tenant_id;
  }
  // ... more logic
};

// In LeadForm.jsx
const handleSubmit = async () => {
  if (!data.tenant_id) {
    data.tenant_id = user.tenant_id;
  }
  // ... same logic repeated
};

// ✅ Good: Shared utility
// utils/tenantHelpers.js
export function ensureTenantId(data, user) {
  return {
    ...data,
    tenant_id: data.tenant_id || user?.tenant_id
  };
}

// In forms
const handleSubmit = async () => {
  const formData = ensureTenantId(data, user);
  // ... rest of logic
};
```

### Using Configuration Objects

```javascript
// ❌ Bad: Hardcoded values scattered throughout
if (pageName === 'Dashboard' || pageName === 'Contacts' || pageName === 'Leads') {
  // ...
}

// ✅ Good: Centralized configuration
import { moduleMapping } from '@/utils/navigationConfig';

const moduleId = moduleMapping[pageName];
if (moduleId) {
  // ...
}
```

## Naming Conventions

### Functions

```javascript
// ❌ Bad: Unclear function names
function do() {}
function process(x) {}
function check() {}

// ✅ Good: Descriptive names with verb prefixes
function fetchUserData() {}
function validateEmail(email) {}
function calculateTotalRevenue(orders) {}
```

### Booleans

```javascript
// ❌ Bad: Ambiguous boolean names
const admin = true;
const visible = false;

// ✅ Good: Use is/has/should prefixes
const isAdmin = true;
const hasPermission = false;
const shouldDisplayModal = true;
```

### Constants

```javascript
// ❌ Bad: Magic numbers and strings
if (status === 'active') {}
setTimeout(callback, 60000);

// ✅ Good: Named constants
const USER_STATUS_ACTIVE = 'active';
const ONE_MINUTE_MS = 60000;

if (status === USER_STATUS_ACTIVE) {}
setTimeout(callback, ONE_MINUTE_MS);
```

### Components

```javascript
// ❌ Bad: Generic component names
export function Form() {}
export function Modal() {}

// ✅ Good: Specific, descriptive names
export function ContactForm() {}
export function DeleteConfirmationModal() {}
```

## Security Best Practices

### Environment Variables

```javascript
// ❌ Bad: Hardcoded secrets
const apiKey = 'sk_live_abc123xyz';

// ✅ Good: Environment variables
const apiKey = import.meta.env.VITE_API_KEY;
if (!apiKey) {
  throw new Error('API key not configured');
}
```

### SQL Injection Prevention

```javascript
// ❌ Bad: String concatenation in SQL
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ Good: Parameterized queries
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);
```

### XSS Prevention

```javascript
// ❌ Bad: Rendering unescaped HTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Good: Escaped rendering
<div>{userInput}</div>

// If HTML is necessary, sanitize first
import { sanitizeString } from '@/utils/validation';
<div>{sanitizeString(userInput)}</div>
```

### Authentication Checks

```javascript
import { isSuperAdmin, isAdminOrSuperAdmin } from '@/utils/userPermissions';

// ❌ Bad: Scattered permission checks
if (user.role === 'admin' || user.role === 'superadmin' || user.is_superadmin) {
  // ...
}

// ✅ Good: Centralized permission utilities
if (isAdminOrSuperAdmin(user)) {
  // ...
}
```

### Rate Limiting

```javascript
// Backend: Use rate limiting middleware
import { rateLimiter } from './middleware/rateLimiter.js';

router.post('/api/login', rateLimiter({ max: 5, windowMs: 60000 }), loginHandler);
```

## Migration Strategy

When refactoring existing code:

1. **Start Small**: Begin with utility functions and helpers
2. **Add Tests**: Ensure existing behavior is preserved
3. **Refactor Incrementally**: One module or component at a time
4. **Update Documentation**: Keep docs in sync with code changes
5. **Review and Test**: Thorough testing before deployment

## Code Review Checklist

Before submitting code:

- [ ] All console.log statements are guarded or use devLogger
- [ ] Input validation is present for user data
- [ ] Errors are handled consistently
- [ ] No hardcoded secrets or credentials
- [ ] Functions have descriptive names
- [ ] Complex logic has comments
- [ ] Code follows project conventions
- [ ] Tests pass (if applicable)

## Resources

- [src/utils/README.md](./src/utils/README.md) - Utility modules documentation
- [backend/README.md](./backend/README.md) - Backend architecture guide
- [SECURITY_IMPLEMENTATION_SUMMARY.md](./SECURITY_IMPLEMENTATION_SUMMARY.md) - Security guidelines
