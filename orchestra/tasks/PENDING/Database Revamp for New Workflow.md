### Project Context (Authoritative)

- Database: Supabase Postgres with RLS enabled.
- Schemas used: public (leads, accounts, person_profile).
- Key tables and columns:
    - public.leads(id pk, tenant_id uuid, account_id uuid fk, person_id uuid fk, lead_type text)
    - public.accounts(id pk, tenant_id uuid, account_type text, is_placeholder boolean)
    - public.person_profile(id pk, tenant_id uuid)

### Invariants and Constraints

- B2C leads must have person_id (CHECK).
- B2C leads must reference a placeholder B2C account (CHECK).
- Foreign keys:
    - leads.account_id → accounts.id ON UPDATE CASCADE ON DELETE RESTRICT
    - leads.person_id → person_profile.id ON UPDATE CASCADE ON DELETE SET NULL
- RLS enabled on: leads, accounts, person_profile.
- Tenant isolation: tenant_id must match (auth.jwt() ->> 'tenant_id')::uuid.
- Grants:
    - authenticated: SELECT/INSERT/UPDATE/DELETE on leads
    - authenticated: SELECT on accounts, person_profile

Do not suggest disabling RLS, dropping constraints, or broad grants.

### Required Query Patterns

- Always include tenant_id filters in SQL touching public tables.
- Inserts must include tenant_id explicitly.
- Do not modify tenant_id during updates.
- For B2C leads:
    - person_id IS NOT NULL
    - account_id must reference an accounts row where account_type = 'b2c' AND is_placeholder = true AND same tenant.

Example: List leads for current tenant with joins

### SQL Query

```sql
SELECT
  l.id,
  l.lead_type,
  a.id AS account_id,
  a.account_type,
  p.id AS person_id
FROM public.leads l
JOIN public.accounts a
  ON a.id = l.account_id
JOIN public.person_profile p
  ON p.id = l.person_id
WHERE l.tenant_id = $1
  AND a.tenant_id = $1
  AND p.tenant_id = $1
ORDER BY l.id DESC;
```

Example: Insert a valid B2C lead

### SQL Query

```sql
INSERT INTO public.leads (tenant_id, account_id, person_id, lead_type)
SELECT $1, a.id, $3, 'b2c'
FROM public.accounts a
WHERE a.id = $2
  AND a.tenant_id = $1
  AND a.account_type = 'b2c'
  AND a.is_placeholder = true;
```

Example: Update lead safely

### SQL Query

```sql
UPDATE public.leads l
SET lead_type = $3
WHERE l.id = $2
  AND l.tenant_id = $1;
```

Never generate DELETE/UPDATE without a tenant_id predicate.

### Performance Hints

- Indexed columns: leads(tenant_id), accounts(tenant_id), person_profile(tenant_id).
- Include tenant_id in WHERE clauses early.
- Select only needed columns; avoid SELECT _._

### Supabase Client Usage

- Use @supabase/supabase-js with RLS (anon key on client; service_role only in secure server contexts, never in browsers).
- Pass JWT in requests so auth.uid() and tenant_id policies apply.
- Prefer parameterized queries or Supabase query builders to avoid SQL injection.

### Edge Function Guidelines

- Use Deno.serve.
- Prefer Web APIs; minimize dependencies. If needed, use npm: or jsr: with pinned versions.
- Read tenant_id from JWT and apply tenant_id checks in all DB operations (even with RLS).
- Use EdgeRuntime.waitUntil for background tasks; write files only under /tmp.

Template: Edge Function with tenant-aware insert

```typescript
// supabase/functions/leads-create/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.46.1";
Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const jwt = (await supabase.auth.getUser()).data.user?.user_metadata ?? {};
    const tenantId = (jwt.tenant_id as string) ?? null;
    if (!tenantId) return new Response("Missing tenant_id", { status: 401 });
    const body = await req.json() as {
      account_id: string;
      person_id: string | null;
      lead_type: "b2b" | "b2c";
    };
    // For B2C, ensure person_id is provided and account is placeholder B2C
    if (body.lead_type === "b2c") {
      if (!body.person_id) return new Response("person_id required for b2c", { status: 400 });
      const { data: acct, error: acctErr } = await supabase
        .from("accounts")
        .select("id, account_type, is_placeholder, tenant_id")
        .eq("id", body.account_id)
        .eq("tenant_id", tenantId)
        .single();
      if (acctErr || !acct) return new Response("Invalid account", { status: 400 });
      if (acct.account_type !== "b2c" || !acct.is_placeholder) {
        return new Response("B2C leads must use a placeholder B2C account", { status: 400 });
      }
    }
    const { data, error } = await supabase
      .from("leads")
      .insert({
        tenant_id: tenantId,
        account_id: body.account_id,
        person_id: body.person_id,
        lead_type: body.lead_type,
      })
      .select()
      .single();
    if (error) return new Response(error.message, { status: 400 });
    return new Response(JSON.stringify(data), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(`Unexpected error: ${e}`, { status: 500 });
  }
});
```

### Testing and Safety

- Assume RLS blocks access by default; write tests that authenticate and set tenant_id claim.
- Validate B2C flows (person_id non-null; account placeholder check).
- Verify foreign key behavior:
    - Deleting accounts with linked leads should fail (RESTRICT).
    - Deleting person_profile should null person_id on leads (SET NULL).

### Code Review Checklist for Copilot Suggestions

- Does the SQL include tenant_id conditions for all relevant tables?
- Are inserts providing tenant_id explicitly?
- For B2C, does it enforce person_id and placeholder B2C account?
- Are only required columns selected?
- No suggestions to drop/disable RLS or constraints?
- Uses parameterized queries or query builder (no string interpolation with user input)?

### Common Anti-Patterns to Reject

- SELECT/UPDATE/DELETE without tenant_id filter.
- Cross-tenant joins without tenant_id on both sides.
- Dropping constraints or RLS to “fix” errors.
- Using service_role in client-side contexts.
- UPDATE tenant_id.
- INSERT B2C lead without person_id or without validating placeholder account.

K