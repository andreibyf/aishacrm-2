-- Review queue for unknown inbound email senders before lead promotion.
-- Tenant isolation is enforced in application code via UUID tenant_id scoping.

create table if not exists communications_lead_capture_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  thread_id uuid references communications_threads(id) on delete cascade,
  message_id uuid references communications_messages(id) on delete cascade,
  mailbox_id text,
  mailbox_address text,
  sender_email text not null,
  sender_name text,
  sender_domain text,
  subject text,
  normalized_subject text,
  status text not null default 'pending_review',
  reason text not null default 'unknown_sender',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communications_lead_capture_queue_status_check
    check (status in ('pending_review', 'duplicate', 'promoted', 'dismissed'))
);

create unique index if not exists uniq_communications_lead_capture_queue_message
  on communications_lead_capture_queue (tenant_id, message_id);

create index if not exists idx_communications_lead_capture_queue_tenant_status
  on communications_lead_capture_queue (tenant_id, status, created_at desc);

create index if not exists idx_communications_lead_capture_queue_sender
  on communications_lead_capture_queue (tenant_id, sender_email, sender_domain, created_at desc);
