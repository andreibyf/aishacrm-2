-- Create mapping table for tenant identifier resolution (slug/domain/external) -> tenant UUID
-- Ensures we never hardcode UUIDs in code and can resolve dynamically

create table if not exists tenant_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text unique,
  domain text unique,
  external_id text unique,
  created_at timestamptz not null default now(),
  constraint tenant_identifiers_non_empty check (
    slug is not null or domain is not null or external_id is not null
  )
);

-- Helpful indexes
create index if not exists idx_tident_tenant on tenant_identifiers(tenant_id);
create unique index if not exists uq_tident_slug on tenant_identifiers(lower(slug)) where slug is not null;
create unique index if not exists uq_tident_domain on tenant_identifiers(lower(domain)) where domain is not null;
create unique index if not exists uq_tident_external on tenant_identifiers(external_id) where external_id is not null;

-- Optional convenience view
create or replace view tenant_identifier_resolver as
select
  ti.id as identifier_id,
  ti.slug,
  ti.domain,
  ti.external_id,
  t.id as tenant_id,
  t.name,
  t.domain as tenant_domain
from tenant_identifiers ti
join tenants t on t.id = ti.tenant_id;
