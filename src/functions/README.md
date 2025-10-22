# Local Functions

This folder contains your custom vibe-coded functions that run locally in the app.

## Structure

```
src/functions/
├── index.js              # Main export file - re-exports all functions
├── mcpServer.js          # Example: Local MCP server implementation
├── dataHelpers.js        # Example: Data transformation utilities
├── syncHelpers.js        # Example: Base44 sync/fallback logic
└── README.md             # This file
```

## Adding Functions

1. Create your function file (e.g., `myFunction.js`)
2. Export your function(s) from that file
3. Add an export to `index.js`:
   ```js
   export { myFunction } from './myFunction';
   ```

## Usage in App

Import from the central index:

```js
import { myFunction } from '@/functions';
// or
import * as LocalFunctions from '@/functions';
```

## Browser vs Server Functions

⚠️ **Important**: Functions in this folder run in the browser.
- Don't use Node.js built-ins (fs, path, etc.)
- Don't embed API keys or secrets
- Keep functions pure and stateless when possible

For server-only logic, consider creating a separate middleware service.

## Failover Pattern

To use these functions as fallbacks when Base44 is down:

```js
import { mcpServer as cloudMcpServer } from '@/api/functions';
import { mcpServer as localMcpServer } from '@/functions';

async function mcpServerWithFallback(args) {
  try {
    return await cloudMcpServer(args);
  } catch (error) {
    console.log('Base44 unavailable, using local fallback');
    return await localMcpServer(args);
  }
}
```

## Examples

### Example Function File
```js
// src/functions/dataHelpers.js
export function sanitizeData(data) {
  // Your implementation
  return cleanedData;
}

export function validateRecord(record) {
  // Your implementation
  return { valid: true, errors: [] };
}
```

### Example Export
```js
// src/functions/index.js
export * from './dataHelpers';
export { mcpServer } from './mcpServer';
```

### Example Usage
```js
// In your component
import { sanitizeData, validateRecord } from '@/functions';

const cleaned = sanitizeData(rawData);
const validation = validateRecord(record);
```
