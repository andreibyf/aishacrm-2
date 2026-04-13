# OpenReplay Co-browsing Implementation

> **Implementation Date:** April 12, 2026  
> **Status:** Complete  
> **Purpose:** Remote support, debugging, and user training via screen sharing and remote control

---

## Overview

Implemented **OpenReplay** (open-source, MIT licensed) for co-browsing/remote control functionality - similar to Zoom's "take control" feature. This allows support staff to:

- View user sessions in real-time
- Take control of the user's cursor/mouse
- Navigate the CRM as if they were the user
- Debug issues while guiding users through processes

**What this replaced:**
- ❌ Real-time activity feed (Phase 4 - removed)
- ❌ WebSocket activity tracking feed on Dashboard

**Why the change:**
- Activity feed cluttered the main dashboard interface
- User presence/online status already visible in existing UI
- Co-browsing provides the actual requirement: **support debugging and user guidance**

---

## Features

### 1. Session Replay
- Record full user sessions with context
- DevTools integration (network, console, performance)
- Privacy controls and data sanitization

### 2. Live Co-browsing (Assist Mode)
- Real-time screen sharing
- Remote mouse control (like Zoom's "take control")
- Click/navigate as the user
- Guided walkthroughs

### 3. Privacy & Security
- Data masking for sensitive fields
- Sanitization rules
- Opt-in recording
- Session URLs expire

---

## Implementation Files

### Frontend Hooks
- **`src/hooks/useOpenReplay.js`** - OpenReplay tracker initialization
  - Creates tracker instance
  - Manages session lifecycle
  - Provides session URL for sharing
  - Handles user identity setting

- **`src/hooks/useOpenReplayTracking.js`** - Auto tracking integration
  - Sets user identity after authentication
  - Integrates with `useUser()` context
  - Logs errors
  - Returns initialization status

### Integration Points
- **`src/App.jsx`** - Root-level initialization (lines 3, 7)
  - Calls `useOpenReplayTracking()` on app mount
  - No Router context dependency (uses basic React hooks only)

### Admin Controls
- **User Management** - "View Session" button next to "Login As"
  - Opens user's current session in OpenReplay dashboard
  - Enables Assist mode for live co-browsing

### Configuration
- **`.env.example`** - Environment variable examples
  - `VITE_OPENREPLAY_PROJECT_KEY` - Project identifier from OpenReplay Cloud
  - `VITE_OPENREPLAY_INGEST_POINT` - (Optional) Self-hosted ingest endpoint
  - `VITE_OPENREPLAY_DASHBOARD_URL` - Dashboard URL for "View Session" links

---

## Setup Instructions

See [OPENREPLAY_SETUP_GUIDE.md](../admin-guides/OPENREPLAY_SETUP_GUIDE.md) for:  
1. Creating OpenReplay Cloud account  
2. Getting project key  
3. Configuring environment variables  
4. Testing Assist mode  

---

## What Was Removed

### Phase 4 - Activity Feed (Removed)
❌ **Files deleted/disabled:**
- `src/components/activity/ActivityFeed.jsx` - Real-time activity feed UI
- `src/hooks/useActivityTracking.js` - Activity event tracking
- `src/utils/activityTracker.js` - Activity event utilities
- Dashboard sidebar layout (removed from `src/pages/Dashboard.jsx`)

✅ **Files kept:**
- `backend/lib/websocketServer.js` - WebSocket infrastructure (may be used for other features)
- `src/hooks/useSocket.js` - Socket.io client hook
- WebSocket dependencies (`socket.io`, `socket.io-client`, `@socket.io/redis-adapter`)

**Reason for removal:**
- Activity feed showed "who's viewing what page" in real-time
- This is NOT what was needed for support/debugging
- Already have user presence/online indicators
- Dashboard should focus on CRM metrics, not team activity

---

## Technical Details

### No Router Context Dependency

`useOpenReplayTracking()` does NOT use `useLocation()` - it only uses:
- `useEffect` (React)
- `useOpenReplay` (custom hook)
- `useUser` (context provider)

This means it can be called at the App.jsx root level without Router context issues.

### User Identity Tracking

When a user authenticates:
```javascript
setUserInfo(user.id, {
  email: user.email,
  name: user.name || user.email,
  role: user.role,
  tenantId: user.tenant_id,
});
```

This enriches session recordings with user context for easier support identification.

### WebSocket Infrastructure Retained

While the activity feed UI was removed, the WebSocket server (`backend/lib/websocketServer.js`) remains functional and can be used for:
- Real-time notifications
- Chat features
- Live data updates
- Other collaborative features

---

## Usage for Support

### As Support Staff

1. Navigate to **User Management**
2. Find the user experiencing issues
3. Click **"View Session"** button next to their name
4. OpenReplay dashboard opens with their current session
5. Enable **Assist mode** to:
   - See their screen in real-time
   - Take control of their cursor
   - Click/navigate to demonstrate actions
   - Guide them through workflows

### As End User

- Sessions are recorded automatically when OpenReplay is configured
- No action needed - just use the CRM normally
- Support can join your session when you request help

---

## Migration Notes

### From Activity Feed to Co-browsing

**Before (Activity Feed):**
- ❌ Dashboard sidebar showing real-time page views
- ❌ "User X viewed Contacts page" events
- ❌ Cluttered main dashboard interface

**After (OpenReplay):**
- ✅ Clean dashboard focused on CRM metrics
- ✅ Support staff click "View Session" to cobrowse when needed
- ✅ Remote control capability for demonstrating actions
- ✅ Session replay for post-issue debugging

### Code Changes

**`src/App.jsx`:**
```diff
+ import { useOpenReplayTracking } from '@/hooks/useOpenReplayTracking';

  function App() {
+   // Initialize OpenReplay for co-browsing/session replay
+   useOpenReplayTracking();
    
    return <Pages />;
  }
```

**`src/pages/Dashboard.jsx`:**
```diff
- import { ActivityFeed } from '@/components/activity/ActivityFeed';

  return (
-   <div className="flex gap-6">
-     <div className="flex-1 space-y-6">
-       {renderDashboard()}
-     </div>
-     <div className="w-80 flex-shrink-0">
-       <ActivityFeed />
-     </div>
-   </div>
+   <div className="space-y-6">
+     {renderDashboard()}
+   </div>
  );
```

**`src/pages/index.jsx`:**
```diff
- import { useActivityTracking } from '@/hooks/useActivityTracking';
- import { useOpenReplayTracking } from '@/hooks/useOpenReplayTracking';
- 
- function TrackingInitializer() {
-   useActivityTracking();
-   useOpenReplayTracking();
-   return null;
- }

  export default function Pages() {
    return (
      <Router>
-       <TrackingInitializer />
        <PagesContent />
      </Router>
    );
  }
```

---

## Testing

### Manual Testing

1. **Session Recording:**
   - Login to CRM
   - Navigate a few pages
   - Check OpenReplay dashboard for session

2. **Assist Mode:**
   - Open two browsers (admin + user)
   - Admin: User Management → "View Session"
   - Admin: Enable Assist mode
   - Verify real-time screen sharing
   - Test remote cursor control

3. **Privacy:**
   - Verify sensitive fields are masked
   - Check data sanitization rules
   - Confirm session URLs expire

### Automated Testing

```bash
# Frontend builds successfully
npm run build

# ESLint clean
npx eslint src/App.jsx src/pages/index.jsx src/pages/Dashboard.jsx
```

---

## Future Enhancements

### Optional Features (Not Implemented)

- **Settings Page Integration:** Move co-browsing controls to Settings (if requested)
- **Session List in Admin:** Show all active sessions
- **Conditional Recording:** Only record when user opts in
- **Custom Sanitization:** Add CRM-specific privacy rules

### Alternative Use Cases

OpenReplay can also be used for:
- Product analytics
- User behavior analysis
- Performance monitoring
- Error tracking

See [OpenReplay documentation](https://docs.openreplay.com/) for more features.

---

## References

- [OpenReplay Setup Guide](../admin-guides/OPENREPLAY_SETUP_GUIDE.md)
- [OpenReplay Official Docs](https://docs.openreplay.com/)
- [OpenReplay Assist Documentation](https://docs.openreplay.com/en/assist/)
- [CHANGELOG.md](../../CHANGELOG.md) - Phase 3 implementation details
