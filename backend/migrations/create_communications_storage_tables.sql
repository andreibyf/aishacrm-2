-- Communications storage tables for provider-backed inbound/outbound email threading.
-- Tenant isolation is enforced in application code via UUID tenant_id scoping.

create table if not exists communications_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mailbox_id text not null,
  mailbox_address text,
  subject text,
  normalized_subject text,
  participants jsonb not null default '[]'::jsonb,
  origin text not null default 'provider_mailbox',
  status text not null default 'open',
  first_message_at timestamptz,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_communications_threads_tenant_mailbox
  on communications_threads (tenant_id, mailbox_id);

create index if not exists idx_communications_threads_tenant_last_message
  on communications_threads (tenant_id, last_message_at desc);

create table if not exists communications_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid not null references communications_threads(id) on delete cascade,
  internet_message_id text not null,
  direction text not null default 'inbound',
  provider_cursor text,
  subject text,
  sender_email text,
  sender_name text,
  recipients jsonb not null default '[]'::jsonb,
  cc jsonb not null default '[]'::jsonb,
  bcc jsonb not null default '[]'::jsonb,
  received_at timestamptz,
  text_body text,
  html_body text,
  raw_source text,
  headers jsonb not null default '{}'::jsonb,
  activity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, internet_message_id)
);

create index if not exists idx_communications_messages_tenant_thread
  on communications_messages (tenant_id, thread_id, received_at desc);

create table if not exists communications_entity_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid references communications_threads(id) on delete cascade,
  message_id uuid references communications_messages(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  link_scope text not null default 'message',
  source text not null default 'communications_ingest',
  confidence numeric(5,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint communications_entity_links_scope_check
    check (link_scope in ('thread', 'message', 'activity')),
  constraint communications_entity_links_type_check
    check (entity_type in ('lead', 'contact', 'account', 'opportunity', 'activity'))
);

create unique index if not exists uniq_communications_entity_links_thread
  on communications_entity_links (tenant_id, thread_id, entity_type, entity_id)
  where thread_id is not null;

create unique index if not exists uniq_communications_entity_links_message
  on communications_entity_links (tenant_id, message_id, entity_type, entity_id)
  where message_id is not null;
