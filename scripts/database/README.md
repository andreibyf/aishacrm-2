# Database Scripts

## Overview

These scripts are **backend utilities** that interact directly with the database. They require backend dependencies (`pg`, `dotenv`) that are **not** included in the frontend `package.json`.

## Running Database Scripts

To run these scripts, you need to install backend dependencies first:

```bash
# Option 1: Run from backend directory (recommended)
cd backend
npm install
doppler run -- node ../scripts/database/create-superadmin.js

# Option 2: Temporarily install pg and dotenv in root
npm install --no-save pg dotenv
doppler run -- node scripts/database/create-superadmin.js
```

## Scripts Requiring Backend Dependencies

The following scripts use `pg` (PostgreSQL driver) and/or `dotenv`:

- `create-superadmin.js` - Creates superadmin user in database
- `create-test-tenant.js` - Creates test tenant
- `check-user-tenant.js` - Checks user-tenant relationships
- Other analysis and debugging scripts

## Why Not in Backend Directory?

These scripts are kept in the root `scripts/database/` directory for historical reasons and because they're used during development setup from the project root. However, they should be considered backend utilities.

## Future Consideration

Consider moving these scripts to `backend/scripts/database/` to better reflect their dependency requirements and purpose.
