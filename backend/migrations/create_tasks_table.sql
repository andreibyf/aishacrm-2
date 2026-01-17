CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  entity_type TEXT,
  entity_id UUID,
  assigned_to TEXT,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
