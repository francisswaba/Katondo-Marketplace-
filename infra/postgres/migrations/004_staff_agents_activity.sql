ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_subject TEXT;
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
UPDATE users SET identity_subject = id::text WHERE identity_subject IS NULL;
ALTER TABLE users ALTER COLUMN identity_subject SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_identity_subject_unique_idx ON users(identity_subject);

CREATE TABLE IF NOT EXISTS staff_members (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  job_title TEXT,
  roles TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'departed')),
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_by_user_id UUID REFERENCES users(id),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_triage_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES service_agents(id),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('potentially_clear', 'needs_human_review', 'risk_flag')),
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  reviewed_by_user_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_collection_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  collect_buyer_activity BOOLEAN NOT NULL DEFAULT FALSE,
  collect_seller_activity BOOLEAN NOT NULL DEFAULT FALSE,
  collect_staff_activity BOOLEAN NOT NULL DEFAULT FALSE,
  collect_ai_agent_activity BOOLEAN NOT NULL DEFAULT FALSE,
  collect_security_activity BOOLEAN NOT NULL DEFAULT FALSE,
  collect_technical_context BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  updated_by_user_id UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO activity_collection_settings (singleton) VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('buyer', 'seller', 'staff', 'ai_agent', 'system')),
  actor_client_id TEXT,
  actor_roles TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (category IN ('buyer', 'seller', 'staff', 'ai_agent', 'security')),
  event_name TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  route TEXT,
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_collection_setting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  previous_settings JSONB NOT NULL,
  new_settings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_members_status_idx ON staff_members(status);
CREATE INDEX IF NOT EXISTS service_agents_status_idx ON service_agents(status);
CREATE INDEX IF NOT EXISTS agent_triage_seller_created_idx ON agent_triage_recommendations(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_category_created_idx ON activity_events(category, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_actor_created_idx ON activity_events(actor_user_id, created_at DESC);
