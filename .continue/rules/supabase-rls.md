---
description: Standards for working with Supabase, RLS, and Postgres.
---

# Supabase RLS Standards

When working with Supabase:
- Always consider RLS policies before writing queries.
- Prefer RPC functions for complex logic.
- Use row-level security checks in examples.
- Use typed Supabase client with generated types.
- Never expose service_role key in frontend code.
- Use Postgres best practices for indexes and constraints.
- Follow folder structure: src/db, src/supabase, src/migrations.
- Write clear comments for complex queries and policies.
- Ensure proper error handling for database operations.