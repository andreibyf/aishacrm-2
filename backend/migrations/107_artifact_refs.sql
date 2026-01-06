-- Create artifact_refs table: pointers to large artifacts stored in R2 (or other stores)
-- Run in Supabase SQL editor or your migration pipeline.
--
-- SECURITY NOTE:
-- artifact_refs is intended to be accessed ONLY by the backend using the Supabase service role key.
-- Do NOT allow 'authenticated' client access here; otherwise any logged-in user could potentially
-- read/write artifact pointers across tenants if they can query the table directly.
-- Tenant isolation must be enforced server-side and/or via separate, tenant-scoped tables/policies.

create table if not exists public.artifact_refs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null,
  entity_type text null,
  entity_id uuid null,
  r2_key text not null,
  content_type text null,
  size_bytes bigint null,
  sha256 text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_artifact_refs_tenant_kind_created
  on public.artifact_refs (tenant_id, kind, created_at desc);

create index if not exists idx_artifact_refs_entity
  on public.artifact_refs (entity_type, entity_id);

create unique index if not exists uq_artifact_refs_tenant_r2_key
  on public.artifact_refs (tenant_id, r2_key);

-- RLS: Enable row level security
alter table public.artifact_refs enable row level security;

-- Tighten table privileges (defense in depth)
revoke all on table public.artifact_refs from anon, authenticated;
grant all on table public.artifact_refs to service_role;

-- Backend service has full access (SERVICE ROLE ONLY)
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='artifact_refs'
      and policyname='Backend service has full access to artifact_refs'
  ) then
    execute 'drop policy "Backend service has full access to artifact_refs" on public.artifact_refs';
  end if;

  execute $p$
    create policy "Backend service has full access to artifact_refs"
      on public.artifact_refs
      for all
      to service_role
      using (true)
      with check (true)
  $p$;
end $$;
