-- Create artifact_refs table: pointers to large artifacts stored in R2 (or other stores)
-- Run in Supabase SQL editor or your migration pipeline.

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

-- Backend service has full access (matches pattern in 008_supabase_rls_policies.sql)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname='public' 
    and tablename='artifact_refs' 
    and policyname='Backend service has full access to artifact_refs'
  ) then
    create policy "Backend service has full access to artifact_refs"
      on public.artifact_refs
      for all
      to authenticated, service_role
      using (true)
      with check (true);
  end if;
end $$;
