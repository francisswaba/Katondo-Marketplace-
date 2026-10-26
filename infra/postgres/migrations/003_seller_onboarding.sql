CREATE TABLE IF NOT EXISTS seller_applications (
  seller_id UUID PRIMARY KEY REFERENCES sellers(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  business_registration_number TEXT,
  city TEXT NOT NULL,
  seller_terms_version TEXT NOT NULL,
  privacy_notice_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (business_registration_number IS NULL OR length(trim(business_registration_number)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS sellers_user_id_unique_idx ON sellers(user_id);
