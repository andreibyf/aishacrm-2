# Backend Dependencies Rationale

This document explains the purpose and rationale for key backend dependencies in the Aisha CRM backend.

## Database & ORM

### `pg` (PostgreSQL Client)
- **Purpose**: Official PostgreSQL driver for Node.js
- **Usage**: Used in ~40+ migration scripts and utility files for direct database operations
- **Why needed**: 
  - Supabase uses PostgreSQL under the hood
  - Required for running raw SQL migrations, schema changes, and utility scripts
  - Provides Pool connection management for efficient database access
- **Examples**: `backend/scripts/run_migrations.js`, `backend/apply-migration-*.js`

### `@supabase/supabase-js`
- **Purpose**: Official Supabase client library
- **Usage**: Primary database client for application routes and business logic
- **Why needed**:
  - Provides high-level API for database operations with built-in RLS (Row Level Security)
  - Handles authentication integration with Supabase Auth
  - Supports real-time subscriptions
  - Type-safe query builder
- **Examples**: All route files in `backend/routes/`

### ~~`postgres`~~ (REMOVED)
- **Status**: ❌ Removed (not used in codebase)
- **Reason**: Duplicate functionality with `pg` package. Not used anywhere in the codebase.

## Authentication & Security

### `jsonwebtoken`
- **Purpose**: JWT (JSON Web Token) signing and verification for HS256 algorithm
- **Usage**: Backend cookie-based authentication (primary auth method)
- **Why needed**:
  - Signs access and refresh tokens with HS256 shared secret
  - Used in `backend/routes/auth.js` for creating session cookies
  - Used in `backend/middleware/authCookie.js` for cookie verification
- **Cannot remove**: Required for backend's own authentication system
- **Algorithm**: HS256 (HMAC with SHA-256)

### `jose`
- **Purpose**: Modern JWT library supporting JWKS and ES256 verification
- **Usage**: Supabase bearer token verification via JWKS
- **Why needed**:
  - Verifies Supabase-issued JWTs that use ES256 (asymmetric) algorithm
  - Fetches and caches JWKS (JSON Web Key Set) from Supabase
  - Used in `backend/middleware/authenticate.js` for bearer token validation
- **Cannot remove**: Required for verifying tokens from Supabase Auth service
- **Algorithm**: ES256 (ECDSA with P-256 curve) + HS256

### Why Both JWT Libraries?

**Different use cases require different capabilities:**

1. **`jsonwebtoken`**: Backend-to-client authentication
   - Signs tokens with shared secret (HS256)
   - Simple synchronous verification
   - Used for our own cookie-based auth

2. **`jose`**: Client-to-backend Supabase token verification
   - Verifies tokens signed with Supabase's private keys (ES256)
   - Async JWKS fetching and caching
   - Supports modern ES256 algorithm required by Supabase

**Attempting to consolidate would require:**
- Rewriting all backend auth to use `jose` (breaking change)
- Or losing ability to verify Supabase tokens (security issue)

## PDF Generation

### `puppeteer`
- **Purpose**: Headless Chrome automation for PDF generation
- **Usage**: Export reports and documentation as PDFs
- **Files**: 
  - `backend/routes/reports.js` - `/api/reports/export-pdf`, `/api/reports/export-insights-pdf`
  - `backend/routes/documentation.js` - `/api/documentation/user-guide.pdf`
- **Size**: ~300MB installed (includes Chromium)
- **Why needed**:
  - Generates high-quality PDFs from HTML/CSS with full browser rendering
  - Supports complex layouts, charts, and embedded fonts
  - Required for executive reports and user guide exports
- **Alternatives considered**:
  - `pdfkit`: Too low-level, no HTML rendering
  - `html-pdf-node`: Wrapper around puppeteer (same size)
  - `wkhtmltopdf`: Deprecated, security issues
- **Mitigation**: 
  - PDF routes are optional features, not core functionality
  - Can be disabled in production if deployment size is critical
  - Browser binary is cached between deploys in Docker

## Background Jobs

### `bull`
- **Purpose**: Redis-based job queue for background processing
- **Usage**: Email sending, scheduled tasks, async operations
- **Why needed**: Decouples long-running tasks from HTTP request lifecycle
- **Examples**: `backend/workers/emailWorker.js`

### `redis`
- **Purpose**: In-memory data store for caching and job queues
- **Usage**: 
  - Session storage
  - API response caching
  - Bull job queue backend
- **Why needed**: Essential for horizontal scaling and performance

## Email

### `nodemailer`
- **Purpose**: Email sending library
- **Usage**: Transactional emails (password resets, notifications)
- **Why needed**: Required for user account management

## API & Middleware

### `express`
- **Purpose**: Web application framework
- **Why needed**: Core framework for all HTTP routes

### `helmet`
- **Purpose**: Security headers middleware
- **Why needed**: Production security hardening

### `cors`
- **Purpose**: Cross-Origin Resource Sharing middleware
- **Why needed**: Allow frontend on different domain to access API

### `compression`
- **Purpose**: Response compression middleware
- **Why needed**: Reduce bandwidth usage for API responses

### `morgan`
- **Purpose**: HTTP request logger
- **Why needed**: Development debugging and production monitoring

### `cookie-parser`
- **Purpose**: Parse cookies from HTTP headers
- **Why needed**: Required for cookie-based authentication

### `multer`
- **Purpose**: Multipart form-data parsing (file uploads)
- **Why needed**: Handle file uploads in API routes

## AI & External APIs

### `@anthropic-ai/sdk`
- **Purpose**: Anthropic Claude API client
- **Why needed**: AI chat functionality with Claude models

### `openai`
- **Purpose**: OpenAI API client
- **Why needed**: AI chat functionality with GPT models

### `node-fetch`
- **Purpose**: Fetch API for Node.js
- **Why needed**: HTTP client for external API calls

## Documentation

### `swagger-jsdoc`
- **Purpose**: Generate OpenAPI spec from JSDoc comments
- **Why needed**: Auto-generate API documentation

### `swagger-ui-express`
- **Purpose**: Serve Swagger UI for API documentation
- **Why needed**: Interactive API docs at `/api-docs`

## Environment & Configuration

### `dotenv`
- **Purpose**: Load environment variables from `.env` files
- **Why needed**: Configuration management for development

## Summary

**Total runtime dependencies**: 21 (down from 22)

**Removed**:
- ❌ `postgres` - Duplicate of `pg`, unused

**Cannot remove without breaking functionality**:
- `jsonwebtoken` + `jose` - Both required for different auth flows
- `puppeteer` - Required for PDF exports (can be made optional)
- All others are actively used

**Optimization opportunities**:
- Make `puppeteer` optional via feature flag
- Consider lighter PDF generation for basic reports
- Audit AI SDK usage if only one provider is needed
