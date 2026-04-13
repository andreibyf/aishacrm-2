# OpenReplay Setup Guide

**Version:** AiSHA CRM v3.0.x  
**Feature:** Session Replay & Co-browsing (Assist Mode)  
**Access:** Superadmin only

---

## Overview

OpenReplay is an open-source session replay and co-browsing platform that allows support teams to:
- **Record user sessions** with full context (DOM, network, console, performance)
- **Live co-browse** with users (Assist mode) including remote control
- **Debug issues** with DevTools integration
- **Protect privacy** with data sanitization and masking

**License:** MIT (open source)  
**Deployment:** Self-hosted or OpenReplay Cloud  
**Cost:** Free (self-hosted) or $79/month (cloud starter)

---

## Recommended Path (Self-Hosted via CI/CD)

Use the repository workflow to deploy OpenReplay as infrastructure, then connect AiSHA to that instance:

1. Run the GitHub Actions workflow: `OpenReplay Self-Hosted Deploy`
2. Follow deployment guide: [OPENREPLAY_SELF_HOSTED_CICD.md](./OPENREPLAY_SELF_HOSTED_CICD.md)
3. Set frontend environment values:

```bash
VITE_OPENREPLAY_PROJECT_KEY=your_self_hosted_project_key
VITE_OPENREPLAY_INGEST_POINT=https://replay.yourdomain.com/ingest
VITE_OPENREPLAY_DASHBOARD_URL=https://replay.yourdomain.com
```

4. Redeploy frontend through existing CI/CD release workflow.

---

## Quick Start (OpenReplay Cloud - Optional)

### 1. Create OpenReplay Account

1. Go to [https://openreplay.com](https://openreplay.com)
2. Click "Try Cloud" or "Sign Up"
3. Create account with your email
4. Verify email and log in

### 2. Create Project

1. In OpenReplay dashboard, click "New Project"
2. Enter project name: `AiSHA CRM`
3. Select platform: `Web`
4. Copy the **Project Key** (looks like: `abcd1234efgh5678`)

### 3. Configure AiSHA

Add to `.env` file:

```bash
# OpenReplay Configuration
VITE_OPENREPLAY_PROJECT_KEY=your_project_key_here
VITE_OPENREPLAY_DASHBOARD_URL=https://app.openreplay.com
```

### 4. Restart Frontend

```bash
docker compose restart frontend
# OR for dev mode:
npm run dev
```

### 5. Test Session Recording

1. Log in to AiSHA CRM as any user
2. Navigate around (contacts, accounts, etc.)
3. Go to OpenReplay dashboard → Sessions
4. You should see your session appearing in real-time!

---

## Self-Hosted Deployment (Manual/Advanced)

For complete data control, deploy OpenReplay to your own infrastructure.

### Requirements

- **Kubernetes cluster** (AWS EKS, GCP GKE, Azure AKS, or on-prem)
- **Domain/subdomain** for OpenReplay (e.g., `replay.yourdomain.com`)
- **S3-compatible storage** (AWS S3, MinIO, etc.)
- **2+ vCPUs, 8GB RAM** minimum (scales with usage)

### Deployment Steps

1. **Install OpenReplay via Helm:**

```bash
helm repo add openreplay https://openreplay.github.io/openreplay-helm-chart
helm repo update

helm install openreplay openreplay/openreplay \
  --namespace openreplay \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=replay.yourdomain.com \
  --set postgresql.persistence.size=50Gi \
  --set redis.master.persistence.size=10Gi
```

2. **Get Project Key:**

```bash
kubectl -n openreplay get secret openreplay-chalice -o jsonpath='{.data.projectKey}' | base64 -d
```

3. **Configure AiSHA:**

```bash
VITE_OPENREPLAY_PROJECT_KEY=your_self_hosted_project_key
VITE_OPENREPLAY_INGEST_POINT=https://replay.yourdomain.com/ingest
VITE_OPENREPLAY_DASHBOARD_URL=https://replay.yourdomain.com
```

See [OpenReplay Self-Hosting Docs](https://docs.openreplay.com/deployment/deploy-kubernetes) for detailed instructions.

---

## Usage: Viewing User Sessions

### For Superadmins

1. **Navigate to User Management:**
   - Go to Settings → User Management
   - Find the user you want to assist

2. **Open Session Viewer:**
   - Click "View Session" button next to "Login As"
   - Modal shows user details and dashboard link

3. **Access OpenReplay Dashboard:**
   - Click "Open Dashboard"
   - Search for user by email or ID
   - Select their live or recent session

4. **Use Assist Mode (Live Co-browsing):**
   - In session replay, click "Assist" button
   - Request control permission (user will see notification)
   - Once accepted, you can:
     - View their screen in real-time
     - Click and navigate on their behalf
     - Annotate and highlight elements
     - Video call (if WebRTC enabled)

### For End Users

Users are automatically tracked when:
- They log in to AiSHA CRM
- OpenReplay is configured (project key present)

**No action required by users** - sessions are recorded transparently.

To disable recording for specific users, set custom metadata filter in OpenReplay dashboard.

---

## Privacy & Security

### Data Sanitization

OpenReplay automatically redacts sensitive inputs (password, credit card, etc.).

**Manual masking** - Add attribute to sensitive elements:

```html
<!-- Example: mask SSN field -->
<input 
  type="text" 
  name="ssn" 
  data-openreplay-obscured 
/>

<!-- Example: block entire section -->
<div data-openreplay-block>
  <p>Confidential information here</p>
</div>
```

### Security Features

- ✅ **Superadmin-only access** - Only users with `role=superadmin` see "View Session" button
- ✅ **Audit logging** - All session views logged to `audit_log` table (future enhancement)
- ✅ **Tenant isolation** - Users can only see sessions from their own tenant
- ✅ **Data retention** - Configure retention policy in OpenReplay dashboard (default: 30 days)
- ✅ **HTTPS required** - Session data encrypted in transit

### GDPR Compliance

- ✅ Sessions stored in your OpenReplay instance (self-hosted) or OpenReplay Cloud (EU region option)
- ✅ User consent: Add banner informing users of session recording (recommended)
- ✅ Data deletion: Sessions auto-expire per retention policy, or delete manually in dashboard
- ✅ Export data: Download session data via OpenReplay API

---

## Troubleshooting

### Sessions Not Appearing

**Symptom:** No sessions showing in OpenReplay dashboard after setup.

**Solutions:**

1. **Check environment variables:**
   ```bash
   # In browser console:
   console.log(import.meta.env.VITE_OPENREPLAY_PROJECT_KEY)
   ```
   Should output your project key (not `undefined`).

2. **Check browser console for errors:**
   - Open DevTools (F12)
   - Look for `[OpenReplay]` logs
   - Common error: `Failed to fetch ingest point` → check `VITE_OPENREPLAY_INGEST_POINT`

3. **Verify network requests:**
   - DevTools → Network tab
   - Filter by "openreplay"
   - Should see requests to ingest endpoint returning 200 OK

4. **Check firewall/CSP:**
   - OpenReplay Cloud requires outbound HTTPS to `api.openreplay.com`
   - Self-hosted requires access to your ingest endpoint

### Assist Mode Not Working

**Symptom:** Can't enable remote control during live sessions.

**Solutions:**

1. **Check WebRTC support:**
   - Assist requires WebRTC (available in Chrome, Firefox, Safari, Edge)
   - Check `chrome://webrtc-internals` for diagnostics

2. **Firewall:**
   - WebRTC needs UDP ports 3478, 5349 open
   - TURN server may be required for restrictive networks

3. **User must accept:**
   - Assist mode requires user to accept control request
   - If user's browser is closed, Assist won't work (use session replay instead)

### Performance Impact

**Symptom:** Users report slow page loads after OpenReplay enabled.

**Solutions:**

1. **Check tracker size:**
   - OpenReplay tracker is ~50KB (gzipped)
   - Loads asynchronously, minimal impact

2. **Reduce sampling rate:**
   ```javascript
   // In useOpenReplay.js, add:
   tracker.start({
     userID: userId,
     respectDoNotTrack: true,
     // Record only 50% of sessions:
     sampleRate: 50
   });
   ```

3. **Conditional loading:**
   - Only load OpenReplay for authenticated users
   - Skip for bot traffic (already handled automatically)

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_OPENREPLAY_PROJECT_KEY` | Yes | - | Project key from OpenReplay dashboard |
| `VITE_OPENREPLAY_INGEST_POINT` | No | Cloud default | Custom ingest endpoint (self-hosted only) |
| `VITE_OPENREPLAY_DASHBOARD_URL` | No | `https://app.openreplay.com` | Dashboard URL for viewing sessions |

### Tracker Options

Customize in `src/hooks/useOpenReplay.js`:

```javascript
const tracker = new Tracker({
  projectKey,
  ingestPoint,
  
  // Privacy
  respectDoNotTrack: true,        // Honor DNT browser setting
  obscureTextEmails: true,        // Mask email addresses
  obscureTextNumbers: true,       // Mask credit card numbers
  obscureInputEmails: true,       // Mask email input fields
  
  // Performance
  sampleRate: 100,                // Record 100% of sessions
  consoleMethods: ['log', 'error'], // Capture console logs
  
  // Network
  capturePerformance: true,       // Capture performance metrics
  network: {
    capturePayload: true,         // Capture request/response bodies
    sanitizer: (data) => {        // Sanitize sensitive data
      if (data.url.includes('password')) {
        data.body = '[REDACTED]';
      }
      return data;
    }
  }
});
```

---

## Advanced Features

### Custom Events

Track business events for analysis:

```javascript
import { useOpenReplay } from '@/hooks/useOpenReplay';

function MyComponent() {
  const { trackEvent } = useOpenReplay();
  
  const handlePurchase = () => {
    trackEvent('purchase_completed', {
      amount: 99.99,
      product: 'Enterprise Plan'
    });
  };
}
```

### Error Tracking Integration

OpenReplay auto-captures JS errors. Integrate with Sentry:

```javascript
// In useOpenReplay.js:
import * as Sentry from '@sentry/react';

tracker.start({
  onError: (error) => {
    Sentry.captureException(error);
  }
});
```

### Backend Logs Integration

Link frontend sessions with backend logs:

```javascript
// In API error handler:
const sessionUrl = tracker.getSessionURL();
logger.error('API request failed', {
  sessionUrl,
  error: err.message
});
```

---

## Migration from CoBrowse.io

If you previously had CoBrowse.io integration:

1. **Uninstall:** Already removed in this implementation
2. **Setup OpenReplay:** Follow Quick Start guide above
3. **Feature parity:**
   - ✅ Live co-browsing → OpenReplay Assist mode
   - ✅ Session codes → Session URLs (share via dashboard)
   - ✅ Remote control → Assist mode with user consent
   - ✅ Annotations → Available in Assist mode
   - ➕ **Bonus:** Session replay, DevTools, performance metrics

---

## Resources

- **OpenReplay Docs:** [https://docs.openreplay.com](https://docs.openreplay.com)
- **GitHub:** [https://github.com/openreplay/openreplay](https://github.com/openreplay/openreplay) (11.9k ⭐)
- **Community Slack:** [https://slack.openreplay.com](https://slack.openreplay.com)
- **Self-Hosting Guide:** [Kubernetes Deployment](https://docs.openreplay.com/deployment/deploy-kubernetes)
- **API Reference:** [OpenReplay Tracker API](https://docs.openreplay.com/sdk/constructor)

---

## Support

For AiSHA-specific OpenReplay issues:
- Check [IMPLEMENTATION_SUMMARY_DELETE_UI_AND_ACTIVITY_FEED.md](./IMPLEMENTATION_SUMMARY_DELETE_UI_AND_ACTIVITY_FEED.md)
- Review [CHANGELOG.md](../../CHANGELOG.md) (OpenReplay integration section)

For OpenReplay platform issues:
- [GitHub Issues](https://github.com/openreplay/openreplay/issues)
- [Community Slack](https://slack.openreplay.com)
