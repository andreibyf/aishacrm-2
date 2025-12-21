# Archived Ad-hoc Test Scripts

These are one-off debug/validation scripts that were previously in the backend root.
They are not part of the official test suite and were moved here for cleanup on December 17, 2025.

## Contents

| Script | Purpose |
|--------|---------|
| `test-activities.js` | Activity API testing |
| `test-activity-filter.js` | Activity filter validation |
| `test-ai-campaigns.js` | AI campaigns testing |
| `test-ai-revenue.js` | AI revenue calculation testing |
| `test-all-metadata.js` | Metadata structure testing |
| `test-cache.js` | Cache layer testing |
| `test-cron-system.js` | Cron job testing |
| `test-data-counts.js` | Data count validation |
| `test-db-connection.js` | Database connection testing |
| `test-direct-connection.js` | Direct DB connection testing |
| `test-endpoints.js` | Endpoint availability testing |
| `test-entity-label-db.js` | Entity label DB testing |
| `test-generate-unique-id.js` | Unique ID generation testing |
| `test-key-endpoints.js` | Key endpoint testing |
| `test-mcp-stats.js` | MCP statistics testing |
| `test-metadata-merge.js` | Metadata merge logic testing |
| `test-name-validation.js` | Name validation testing |
| `test-supabase-api.js` | Supabase API testing |
| `test-time-deletes.js` | Time-based delete testing |
| `test-unique-id-e2e.js` | Unique ID E2E testing |
| `test-with-search-path.js` | Search path testing |

## Usage

These scripts can still be run manually if needed:

```bash
cd backend/archive/adhoc-test-scripts
node test-db-connection.js
```

## Official Test Suite

Use the official test suite in `backend/__tests__/`:

```bash
cd backend
npm test
```
