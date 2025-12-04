# AiSHA Assistant User Guide

_Last updated: December 3, 2025_

AiSHA (AI Super Hi-performing Assistant) is the executive-assistant layer that runs inside the CRM sidebar. This guide explains how end users, product, and support teams should interact with the Phase 4-ready assistant experience, including layout, quick actions, guided forms, and realtime voice controls.

---

## 1. Opening the Assistant

1. Click the AiSHA avatar button in the lower-right corner of any CRM view.
2. The right-side drawer widens to **540px** and shows the executive header card.
3. To close the assistant, press **Esc** or click the **×** button in the header.

> **Tip:** The assistant always runs in **read-only / propose-actions** mode. It never writes to production data without explicit confirmation via the existing Brain pipeline.

---

## 2. Layout Overview

| Region | Purpose |
|--------|---------|
| **Executive Hero Card** | Shows the AiSHA avatar, current tenant badge, user role, and realtime status chip (Live voice + chat, Chat ready, or Chat-only). This gives leadership a quick health glance before issuing commands. |
| **Workspace Snapshot** | Highlights the active tenant and role, including whether guided forms are unlocked. If no tenant is selected, the card explains how to unlock forms and insights. |
| **Quick Actions** | Two-column grid of high-frequency prompts ("Show leads", "View pipeline", "My tasks"). Each chip sends the prefilled instruction immediately. |
| **Guided Creations** | Icon buttons for entity-specific conversational forms (Lead, Account, Contact, Opportunity, Activity). Selecting a chip opens an in-panel form with validation and success toasts. |
| **Suggestions** | Context-aware nudges tied to the current page. Tapping a suggestion queues its prompt in the composer. |
| **Transcript Stream** | Ordered list of user/assistant bubbles with Markdown rendering, inline action pills, and welcome card styling for the first assistant message. |
| **Composer & Voice Controls** | Unified area for drafting messages, enabling realtime voice, managing push-to-talk (PTT), and monitoring telemetry/warnings. |

---

## 3. Voice & Realtime Modes

The footer exposes all voice states so users always know whether the mic or speaker is active.

### 3.1 Enable Realtime Voice

1. Click **Enable Realtime Voice**. The system fetches an ephemeral WebRTC key and connects to the OpenAI Realtime API.
2. When connected, the status pill reads **Live voice + chat** and the LED on the avatar glows green.
3. Use the dedicated **Hold to Talk** button (or the spacebar) to unmute the mic temporarily. Release to send the captured turn.
4. Press the red **stop square** to end the session.

### 3.2 Push-to-Talk (Legacy STT)

- Toggle **Push to Talk** when realtime is unavailable. AiSHA records audio locally, sends it through STT, displays the transcript, and auto-sends safe commands.
- Destructive phrases ("delete all...") are blocked and require manual editing before sending.

### 3.3 Status Indicators

| Indicator | Meaning | Suggested Action |
|-----------|---------|------------------|
| `Connecting…` | Realtime session establishing. | Wait a few seconds before speaking. |
| `Realtime voice requires a supported browser.` | Browser lacks WebRTC support. | Switch to Chromium-based (Chrome/Edge 120+). |
| Amber warning bar | Voice disabled for tenant. | Ask admins to enable **Realtime Voice** module. |
| Rose error card | Realtime error with code/hint. | Review hint, click **Dismiss**, and retry (often toggling off/on fixes it). |
| `Continuous Listening` card | Legacy STT is actively recording or transcribing. | Speak normally or click stop to end recording. |

---

## 4. Guided Forms & Quick Actions

### 4.1 Quick Actions

- Located directly under the hero card.
- Instant, one-click prompts for executive overviews.
- Disabled while a message is sending to avoid duplicate submissions.

### 4.2 Guided Creations

1. Ensure a tenant is selected (badge must show **Active tenant**).
2. Click an entity chip (Lead, Account, Contact, Opportunity, Activity).
3. Complete the conversational form that appears below the chip row.
4. AiSHA confirms success via toast + assistant message. Errors display inline with retry guidance.

### 4.3 Suggestions Panel

- Appears when the AI engine has context-specific recommendations (e.g., "Summarize this account").
- Each pill sources metadata (hover reveals the source).
- Selecting a suggestion pre-fills the composer and focuses the textarea for optional edits.

---

## 5. Testing & Preview Workflow

| Scenario | Recommended Workflow |
|----------|---------------------|
| UI/UX iteration | Run `npm run dev` (frontend) and `npm run dev` inside `backend/`. Preview at `http://localhost:5173` with hot reload.
| Docker validation | After finishing tweaks, run `docker compose up -d --build frontend` so the container picks up the latest bundle and opens `http://localhost:4000`.
| Voice QA | Use Chromium-based browsers with mic permissions. Test both realtime and legacy STT fallbacks. Verify warning banners and telemetry debug card (enable via `VITE_AI_DEBUG_TELEMETRY=true`).
| Asset updates | Replace `public/aisha-avatar.jpg` with a same-sized square image to keep the glow ring aligned. Clear cache or hard-refresh to see the change.

---

## 6. Troubleshooting

| Symptom | Resolution |
|---------|------------|
| Panel width or layout hasn’t changed | Ensure you’re on the dev server (`npm run dev`). Docker containers require rebuilds to pick up `src/` edits. |
| `ReferenceError: Cannot access 've' before initialization` in console | This occurs if local edits reorder constants improperly. Pull the latest `AiSidebar.jsx` or run linting to catch block-scoped hoisting issues. |
| Voice commands stuck on "Transcribing…" | Check network tab for `/api/ai/speech-to-text` failures. If realtime mode is enabled, toggle it off/on to refresh the ephemeral token. |
| Guided forms disabled | Select a tenant from the global tenant picker. The Workspace card will update to **Active tenant** and unlock forms. |
| Suggestions missing | They only populate on routes where telemetry has enough context (e.g., Accounts, Opportunities). Navigate to a supported view and wait a few seconds. |

---

## 7. Related References

- **Developer Manual:** `docs/AISHA_CRM_DEVELOPER_MANUAL.md` (see "AiSidebar overview for Phase 4 workstreams")
- **Phase 4 Plan:** `orchestra/phases/phase4/PHASE_4_FULL_CUTOVER.md`
- **Speech Hooks Tests:** `src/components/ai/__tests__/AiSidebar.voice.test.jsx`
- **Realtime Hook:** `src/hooks/useRealtimeAiSHA.js`

Maintain this guide alongside any future Phase 4-ready UI work so launch, training, and support teams can rely on a single source of truth for AiSHA-focused workflows.
