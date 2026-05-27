-- Finance Ops Runtime v1 scaffold
-- Dev-only draft schema. Do not apply to production without review.
-- This migration intentionally creates isolated finance tables only.

create schema if not exists finance;

create table if not exists finance.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  account_code text not null,
  name text not null,
  classification text not null check (classification in ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  account_type text not null,
  parent_account_id uuid references finance.accounts(id),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, account_code)
);

create table if not exists finance.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entry_number text,
  source_type text,
  source_id text,
  memo text,
  currency text not null default 'usd',
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'posted', 'reversed', 'voided')),
  posted_at timestamptz,
  posted_by uuid,
  reversal_of uuid references finance.journal_entries(id),
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  braid_trace_id text,
  ai_generated boolean not null default false,
  governance_policy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entry_number)
);

create table if not exists finance.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  journal_entry_id uuid not null references finance.journal_entries(id),
  account_id uuid references finance.accounts(id),
  account_name text not null,
  classification text not null check (classification in ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  line_number integer not null,
  description text,
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  created_at timestamptz not null default now(),
  check (not (debit_cents > 0 and credit_cents > 0)),
  check (debit_cents > 0 or credit_cents > 0),
  unique (journal_entry_id, line_number)
);

create or replace function finance.validate_journal_entry_balance(target_entry_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(sum(debit_cents), 0) = coalesce(sum(credit_cents), 0)
  from finance.journal_lines
  where journal_entry_id = target_entry_id;
$$;

create table if not exists finance.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id text,
  invoice_number text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'sent', 'paid', 'voided', 'reversed')),
  issue_date date,
  due_date date,
  currency text not null default 'usd',
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  memo text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  braid_trace_id text,
  ai_generated boolean not null default false,
  governance_policy_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create table if not exists finance.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null references finance.invoices(id),
  line_number integer not null,
  description text not null,
  quantity numeric(18, 4) not null default 1,
  unit_price_cents bigint not null default 0,
  line_total_cents bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_number)
);

create table if not exists finance.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'executed', 'rejected')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  approval_policy text,
  escalation_target text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text,
  actor_id text,
  actor_type text not null,
  source text not null,
  request_id text,
  braid_trace_id text,
  correlation_id text,
  causation_id text,
  payload jsonb not null default '{}'::jsonb,
  policy_decision jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists finance.adapter_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  provider text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  operation text not null check (operation in ('pull', 'push_draft', 'sync_status', 'void', 'reconcile')),
  mode text not null check (mode in ('read_only', 'draft_only', 'approval_required_write')),
  status text not null default 'draft' check (status in ('draft', 'queued', 'running', 'succeeded', 'failed')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_accounts_tenant_id
  on finance.accounts (tenant_id);

create index if not exists idx_finance_journal_entries_tenant_status
  on finance.journal_entries (tenant_id, status);

create index if not exists idx_finance_journal_lines_entry_id
  on finance.journal_lines (journal_entry_id);

create index if not exists idx_finance_invoices_tenant_status
  on finance.invoices (tenant_id, status);

create index if not exists idx_finance_approvals_tenant_status
  on finance.approvals (tenant_id, status);

create index if not exists idx_finance_audit_events_tenant_created_at
  on finance.audit_events (tenant_id, created_at desc);

create index if not exists idx_finance_adapter_jobs_tenant_status
  on finance.adapter_jobs (tenant_id, status);

-- RLS placeholders only. Claim format must be confirmed before finalizing policies.
-- alter table finance.accounts enable row level security;
-- alter table finance.journal_entries enable row level security;
-- alter table finance.journal_lines enable row level security;
-- alter table finance.invoices enable row level security;
-- alter table finance.invoice_lines enable row level security;
-- alter table finance.approvals enable row level security;
-- alter table finance.audit_events enable row level security;
-- alter table finance.adapter_jobs enable row level security;
