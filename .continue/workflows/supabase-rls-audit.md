# Supabase RLS Audit Workflow

Perform a Supabase RLS audit:
1. List all tables with RLS enabled.
2. For each table, list all policies.
3. Identify missing SELECT, INSERT, UPDATE, DELETE policies.
4. Identify policies that are too permissive.
5. Identify policies that are too restrictive.
6. Identify missing indexes for policy filters.
7. Suggest RPC functions where logic is too complex.
8. Suggest improvements to security and performance.
This is critical for production safety.
