# Known Issues & Expected Behaviors

> Non-critical issues and expected behaviors tracked for awareness.

---

## Precursor 401 on `/api/ai/conversations`

**Status**: EXPECTED BEHAVIOR (as of v4.6.3)
**Severity**: Cosmetic (console only)
**Affects**: Admin / SuperAdmin users on initial page load

### Symptom

On first page load, the browser DevTools console shows:

```
POST /api/ai/conversations 401 (Unauthorized)
```

This is a **single network-level 401** that appears before any user interaction with the AI assistant.

### Root Cause

The `AiSidebarProvider` (wraps the entire app in `Layout.jsx`) eagerly creates an AI conversation as soon as the `user` object is populated. For admin users:

1. The `user` object loads from cache/state (fast) → triggers the `useEffect`
2. The auth cookie (`aisha_access`) may not be fully established yet (slower)
3. The `POST /api/ai/conversations` fires with `credentials: 'include'`, but the cookie isn't there → **401**
4. Once the auth cookie is set (usually within 1-2 seconds), subsequent requests work fine

### Why It's Not a Bug

- The sidebar retries silently (2s, then 4s delay) and succeeds on retry
- If all retries fail, the conversation is created on first user interaction
- All other CRM functionality works normally — only the eager sidebar pre-creation is affected
- The error is downgraded to `console.debug` (not visible unless DevTools filter shows "Verbose")

### Files Involved

- `src/components/ai/useAiSidebarState.jsx` — Sidebar provider with retry logic (lines 135-180)
- `src/api/conversations.js` — API client with 401 suppression
- `src/pages/Layout.jsx` — `AiSidebarProvider` wraps the app (line 3902)
- `backend/middleware/authenticate.js` — `authenticateRequest` middleware

### Permanent Fix Options (Future)

1. **Defer sidebar conversation creation** until the first user interaction with the AI sidebar (lazy init)
2. **Add an auth-ready signal** — have the auth layer emit an event when the cookie is established, and only then create the conversation
3. **Cookie warmup** — add a lightweight `/api/auth/ping` endpoint that the app calls on boot to establish the cookie before any API calls

---
