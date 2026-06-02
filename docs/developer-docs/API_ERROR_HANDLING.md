# Frontend API Error Handling Utility

## Purpose

`src/utils/apiErrorHandling.js` standardizes how frontend code performs fetch requests, parses failures, and logs context.  
Use it to reduce inconsistent error handling and race-prone request code in components.

## Exports

- `fetchJsonWithHandling(url, options?, meta?)`
  - Wraps `fetch`
  - Throws normalized errors for:
    - network failures (`NetworkRequestError`)
    - non-OK HTTP responses (`ApiRequestError`, includes `status` and parsed `payload`)
    - invalid JSON (`ResponseParseError`)
  - Returns parsed JSON object, or `null` for empty successful body
- `getErrorMessage(error, fallback?)`
  - Produces a user-safe message string from unknown error values
- `isAbortError(error)`
  - Detects abort/cancellation errors (`AbortError`/`ABORT_ERR`)
- `logApiError(context, error, meta?)`
  - Structured error logging via `devLogger`

## Recommended usage pattern

```js path=null start=null
import { useEffect } from 'react';
import {
  fetchJsonWithHandling,
  isAbortError,
  getErrorMessage,
  logApiError,
} from '@/utils/apiErrorHandling';

useEffect(() => {
  const controller = new AbortController();

  const load = async () => {
    try {
      const data = await fetchJsonWithHandling(
        '/api/example',
        {
          credentials: 'include',
          signal: controller.signal,
        },
        {
          fallbackMessage: 'Failed to load example data',
        },
      );

      // apply state updates
    } catch (err) {
      if (isAbortError(err)) return;
      logApiError('ExampleComponent.load', err, { feature: 'example' });
      toast.error(getErrorMessage(err, 'Could not load data'));
    }
  };

  load();
  return () => controller.abort();
}, []);
```

## Implementation guidance

- Always pass `signal` from `AbortController` for effect-driven requests.
- Guard stale responses when multiple requests can overlap (request ID or equivalent).
- Use `fallbackMessage` for user-facing context per request.
- Log with `logApiError()` and include component/function scope plus key metadata.
- Prefer `getErrorMessage()` for toast/UI messages over raw `err.message`.

## Migration checklist

When replacing direct `fetch` usage:

1. Replace `fetch + response.json + response.ok` logic with `fetchJsonWithHandling`.
2. Add `AbortController` in `useEffect` flows.
3. Handle `isAbortError(err)` early and silently.
4. Replace ad-hoc `console.error` with `logApiError(scope, err, meta)`.
5. Use `getErrorMessage(err, fallback)` for user-visible error copy.

## Verification

- Unit tests live in: `src/utils/apiErrorHandling.test.js`
- Run:

```bash path=null start=null
npx vitest run src/utils/apiErrorHandling.test.js
```
