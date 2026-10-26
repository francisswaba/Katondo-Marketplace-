CREATE TABLE IF NOT EXISTS release_controls (
  control_key TEXT PRIMARY KEY CHECK (control_key IN (
    'identity_provider',
    'privacy_notice',
    'seller_terms',
    'data_processing',
    'hosting_and_transfers',
    'seller_onboarding_release'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  approver_authority TEXT,
  evidence_reference TEXT,
  notes TEXT,
  approved_by_user_id UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'approved' OR (
    approver_authority IS NOT NULL AND
    evidence_reference IS NOT NULL AND
    approved_by_user_id IS NOT NULL AND
    approved_at IS NOT NULL
  ))
);

INSERT INTO release_controls (control_key) VALUES
  ('identity_provider'),
  ('privacy_notice'),
  ('seller_terms'),
  ('data_processing'),
  ('hosting_and_transfers'),
  ('seller_onboarding_release')
ON CONFLICT (control_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS release_control_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  approver_authority TEXT,
  evidence_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS release_control_events_key_created_idx ON release_control_events(control_key, created_at DESC);
