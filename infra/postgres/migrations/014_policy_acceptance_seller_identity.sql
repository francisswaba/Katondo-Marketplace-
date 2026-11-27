-- Everyone confirms they are 18 or over and accepts the current privacy notice and
-- terms (one shared version) before using a signed-in Katondo account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS adult_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS policy_accepted_at TIMESTAMPTZ;

-- Seller terms 2026-12-01: individuals give their NRC number and a phone number;
-- businesses give their PACRA registration number (business_registration_number).
ALTER TABLE seller_applications
  ADD COLUMN IF NOT EXISTS nrc_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE seller_applications DROP CONSTRAINT IF EXISTS seller_applications_nrc_format;
ALTER TABLE seller_applications ADD CONSTRAINT seller_applications_nrc_format
  CHECK (nrc_number IS NULL OR nrc_number ~ '^[0-9]{6}/[0-9]{2}/[0-9]$');
ALTER TABLE seller_applications DROP CONSTRAINT IF EXISTS seller_applications_phone_format;
ALTER TABLE seller_applications ADD CONSTRAINT seller_applications_phone_format
  CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[0-9]{8,15}$');
