# OpenReplay Co-browsing Implementation

> **Implementation Date:** April 12, 2026  
> **Status:** Complete  
> **Purpose:** Remote support, debugging, and user training via screen sharing and remote control

---

## Overview

Implemented **OpenReplay** (open-source, MIT licensed) for co-browsing/remote control functionality, similar to Zoom "take control". This allows support staff to:

- View user sessions in real-time
- Take control of the user's cursor/mouse
- Navigate the CRM as if they were the user
- Debug issues while guiding users through processes

**What this added:**
- OpenReplay session replay + Assist support workflow
- WebSocket-powered support telemetry and friction alerts

**Why this approach:**
- Gives support teams live context during user help sessions
- Preserves tenant isolation while enabling real-time assist workflows
- Adds actionable friction signals (`rage_click`, `stuck_user`) for superadmins

---

## Features

### 1. Session Replay
- Record full user sessions with context
- DevTools integration (network, console, performance)
- Privacy controls and data sanitization

### 2. Live Co-browsing (Assist Mode)
- Real-time screen sharing
- Remote mouse control (like Zoom "take control")
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
- **`src/hooks/useOpenReplayTracking.js`** - User identity/session tracking
- **`src/hooks/useImpersonationNavigationSync.js`** - Sync + support interaction telemetry
- **`src/hooks/useSocket.js`** - Shared Socket.IO client hook

### Integration Points
- **`src/App.jsx`** - Root-level OpenReplay tracking initialization
- **`src/pages/index.jsx`** - Router-level impersonation navigation sync

### Backend
- **`backend/lib/websocketServer.js`** - Authenticated Socket.IO server, tenant/user rooms, friction detectors

### Admin Controls
- **User Management** - OpenReplay Assist controls
  - Open the OpenReplay dashboard for the selected user
  - Start Assist mode for live co-browsing

### Configuration
- **`.env.example`** - Environment variable examples
  - `VITE_OPENREPLAY_PROJECT_KEY` - OpenReplay project identifier
  - `VITE_OPENREPLAY_INGEST_POINT` - Optional self-hosted ingest endpoint
  - `VITE_OPENREPLAY_DASHBOARD_URL` - Dashboard URL for Assist session access
  - `SUPPORT_INTELLIGENCE_ENABLED` - Enable friction detection/alerts

---

## Setup Instructions

See [OPENREPLAY_SETUP_GUIDE.md](../admin-guides/OPENREPLAY_SETUP_GUIDE.md) for:
1. Creating OpenReplay account/project
2. Getting project key
3. Configuring environment variables
4. Testing Assist mode

---

## WebSocket Scope

Current implementation uses WebSocket for:
- Impersonation route mirroring (`impersonation_sync_start`, `impersonation_nav`, `impersonation_sync_stop`)
- Support interaction telemetry (`support_interaction`)
- Friction alerts (`support_friction_alert`)

---

## Usage for Support

### As Support Staff
1. Navigate to **User Management**
2. Find the user experiencing issues
3. Click **Start Assist** for the target user
4. OpenReplay dashboard opens for session replay
5. Enable **Assist mode** to:
   - See their screen in real-time
   - Take control of their cursor
   - Click/navigate to demonstrate actions
   - Guide them through workflows

### As End User
- Sessions are recorded automatically when OpenReplay is configured
- No action needed, just use the CRM normally
- Support can join your session when you request help

---

## Testing

### Manual Testing
1. **Session Recording**
   - Login to CRM
   - Navigate a few pages
   - Check OpenReplay dashboard for the session

2. **Assist Mode**
   - Open two browsers (admin + user)
   - Admin: User Management -> Start Assist
   - Admin: Enable Assist mode
   - Verify real-time screen sharing
   - Test remote cursor control

3. **Privacy**
   - Verify sensitive fields are masked
   - Check data sanitization rules
   - Confirm session URLs expire

### Automated Testing
```bash
# Frontend builds successfully
npm run build

# Focused lint checks
npx eslint src/App.jsx src/pages/index.jsx src/hooks/useImpersonationNavigationSync.js
```

---

## References

- [OpenReplay Setup Guide](../admin-guides/OPENREPLAY_SETUP_GUIDE.md)
- [OpenReplay Official Docs](https://docs.openreplay.com/)
- [OpenReplay Assist Documentation](https://docs.openreplay.com/en/assist/)
- [CHANGELOG.md](../../CHANGELOG.md)
