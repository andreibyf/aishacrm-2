# Project Context Primer

You are working in AiSHA CRM.

Basics:
- React 18 + Vite frontend in src/
- Node 22 + Express backend in backend/
- Supabase for DB + RLS
- Redis for cache/memory
- Braid tools for AI operations

Rules:
- Use tenant UUID req.tenant.id
- Use fallbackFunctions for frontend API
- Prefer minimal diffs

Output:
- Acknowledge context briefly
- Ask for task specifics if missing
