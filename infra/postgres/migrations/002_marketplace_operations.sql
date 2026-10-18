CREATE TABLE IF NOT EXISTS seller_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL CHECK (new_status IN ('pending', 'in_review', 'verified', 'rejected', 'suspended')),
  reason TEXT,
  actor_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('platform_managed', 'seller_arranged')),
  service_area TEXT NOT NULL,
  fee_minor BIGINT NOT NULL CHECK (fee_minor >= 0),
  currency CHAR(3) NOT NULL,
  estimated_min_days INTEGER NOT NULL CHECK (estimated_min_days >= 0),
  estimated_max_days INTEGER NOT NULL CHECK (estimated_max_days >= estimated_min_days),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES sellers(id),
  order_reference TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'on_hold', 'submitted', 'paid', 'failed', 'cancelled')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL,
  eligible_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seller_verification_seller_created_idx ON seller_verification_events(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_options_seller_mode_idx ON delivery_options(seller_id, delivery_mode) WHERE is_active;
CREATE INDEX IF NOT EXISTS payment_records_order_idx ON payment_records(order_reference, created_at DESC);
CREATE INDEX IF NOT EXISTS payout_records_seller_status_idx ON payout_records(seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_subject_idx ON audit_events(subject_type, subject_id, created_at DESC);
