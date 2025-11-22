# AiSHA CRM – Interface & Contract Summary (Context Hub Source)

This file is a *summary* of key interfaces and contracts used by the Agent Context Hub when building prompts for agents. It is not exhaustive; it’s the high-signal subset.

## 1. Frontend ↔ Backend

- Frontend SPA calls backend via:
  - `VITE_AISHACRM_BACKEND_URL` (default `http://localhost:4001` in Docker). :contentReference[oaicite:21]{index=21}  
- Backend Express listens on:
  - Internal `PORT=3001`, external `4001` (Docker mapping). :contentReference[oaicite:22]{index=22}  

High-level pattern:

- Frontend API modules under `src/api/` (entities/functions) map to backend routes under `backend/routes/*.js`. :contentReference[oaicite:23]{index=23}  

Example (conceptual):

```ts
// Frontend
GET /api/contacts       → backend/routes/contacts.js (list)
POST /api/contacts      → backend/routes/contacts.js (create)
GET /api/accounts       → backend/routes/accounts.js
POST /api/activities    → backend/routes/activities.js
