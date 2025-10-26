# Recreating Your Functions - Quick Start Guide

## What We've Set Up

✅ `src/functions/` - Directory for your local functions  
✅ `src/functions/index.js` - Central export file  
✅ `src/functions/_template.js` - Template for new functions  
✅ `src/api/fallbackFunctions.js` - Auto-failover wrapper  
✅ `src/functions/README.md` - Documentation

## Step-by-Step: Adding Your Functions Back

### 1. Create a Function File

Copy `_template.js` and rename it:

```pwsh
# Example: Creating mcpServer.js
Copy-Item src/functions/_template.js src/functions/mcpServer.js
```

### 2. Implement Your Function

Edit the new file with your actual logic:

```js
// src/functions/mcpServer.js
export async function mcpServer(params) {
  // Your actual implementation here
  // This runs in the browser, so no Node.js built-ins
  
  return {
    success: true,
    data: processedData
  };
}
```

### 3. Export It

Add to `src/functions/index.js`:

```js
export { mcpServer } from './mcpServer';
```

### 4. Enable Fallback (Optional)

Uncomment the wrapper in `src/api/fallbackFunctions.js`:

```js
export const mcpServer = createFallbackFunction(
  cloudFunctions.mcpServer,
  localFunctions.mcpServer,
  'mcpServer'
);
```

### 5. Use in Components

```js
// Without fallback (local only)
import { mcpServer } from '@/functions';

// With automatic Ai-SHA → local fallback
import { mcpServer } from '@/api/fallbackFunctions';
```

## Common Functions You Might Need

Based on your `src/api/functions.js`, here are likely candidates for local implementations:

### Critical (Ai-SHA down = app broken)
- `getDashboardStats` - Dashboard data
- `getContactHealth` - Contact scoring
- `findDuplicates` - Duplicate detection
- `analyzeDataQuality` - Data validation

### AI/LLM Related
- `mcpServer` / `mcpServerPublic` - MCP protocol
- `invokeTenantLLM` - AI calls
- `invokeSystemOpenAI` - OpenAI fallback

### Data Operations
- `validateEntityReferences` - Referential integrity
- `syncDenormalizedFields` - Data sync
- `detectOrphanedRecords` - Cleanup

### Reports & Export
- `exportReportToPDF` / `exportReportToCSV` - Report generation
- `getDashboardBundle` - Bulk data fetch

## Browser Limitations

Functions in `src/functions/` run in the browser and **cannot**:
- ❌ Use Node.js built-ins (`fs`, `path`, `crypto`, etc.)
- ❌ Access the file system
- ❌ Make server-to-server API calls with secrets
- ❌ Use native modules

They **can**:
- ✅ Make HTTP requests (fetch, axios)
- ✅ Use browser APIs (localStorage, IndexedDB)
- ✅ Process data and run algorithms
- ✅ Call other Ai-SHA functions via the SDK

## If You Need Server-Side Functions

For functions that **must** run on a server (file I/O, secrets, heavy processing):

1. Create a separate backend service (Node/Express, Next.js API routes, etc.)
2. Deploy it to your own infrastructure
3. Call it from the frontend via fetch/axios

I can help set that up if needed.

## Testing Your Functions

### Quick Test

```js
// In browser console or a test component
import { myFunction } from '@/functions';

const result = await myFunction({ test: true });
console.log(result);
```

### With Fallback

```js
import { checkHealth } from '@/api/fallbackFunctions';

// Check if Ai-SHA is up
const isHealthy = await checkHealth();
console.log('Ai-SHA status:', isHealthy);

// This will auto-fallback if Ai-SHA is down
import { myFunction } from '@/api/fallbackFunctions';
const result = await myFunction({ test: true });
```

## Migration Checklist

For each function you want to recreate:

- [ ] Copy `_template.js` to new file
- [ ] Implement actual logic
- [ ] Test in browser console
- [ ] Add export to `index.js`
- [ ] (Optional) Add fallback wrapper
- [ ] Update components to import from new location
- [ ] Test with Ai-SHA down (simulate network failure)

## Need Help?

Common issues:

**"Module not found"**
- Check `src/functions/index.js` has the export
- Verify file name matches import

**"window is not defined" / "require is not defined"**
- You're using Node.js code in browser
- Move to backend service or use browser alternatives

**"Function works locally but not on Ai-SHA"**
- You're mixing local and cloud implementations
- Use `fallbackFunctions.js` to handle both

**"How do I access secrets/API keys?"**
- Environment variables: `import.meta.env.VITE_MY_KEY`
- Never hardcode secrets
- For server-side secrets, use backend middleware

## Next Steps

1. **Identify Priority**: Which functions break your app when Ai-SHA is down?
2. **Start Small**: Pick 1-2 critical functions first
3. **Test Thoroughly**: Ensure they work in browser
4. **Add Fallbacks**: Wire up the auto-failover
5. **Iterate**: Add more functions as needed

**Ready to start?** Pick your first function and let me know if you need help implementing it!
