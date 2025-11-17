-- Agent Memory Archive Tables (Supabase)
-- Persistent archive for ephemeral Redis-based agent sessions and events

-- Sessions archive
CREATE TABLE IF NOT EXISTS public.agent_sessions_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  title TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events archive
CREATE TABLE IF NOT EXISTS public.agent_events_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_archive_tenant ON public.agent_sessions_archive(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_archive_user ON public.agent_sessions_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_archive_session ON public.agent_sessions_archive(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_archive_created ON public.agent_sessions_archive(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_archive_tenant ON public.agent_events_archive(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_archive_user ON public.agent_events_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_archive_session ON public.agent_events_archive(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_archive_created ON public.agent_events_archive(created_at DESC);

-- RLS and Grants: service_role only (backend-managed)
ALTER TABLE public.agent_sessions_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events_archive ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_sessions_archive FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.agent_events_archive FROM PUBLIC, anon, authenticated;

-- Allow service_role to manage archives (service key bypasses RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_sessions_archive TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_events_archive TO service_role;

COMMENT ON TABLE public.agent_sessions_archive IS 'Long-term archive of agent sessions (persisted from ephemeral Redis).';
COMMENT ON TABLE public.agent_events_archive IS 'Long-term archive of agent events (persisted from ephemeral Redis).';
