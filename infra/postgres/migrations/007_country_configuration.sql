ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';

ALTER TABLE seller_applications
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';

ALTER TABLE delivery_options
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';

ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';

ALTER TABLE payout_records
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';

ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_locale_check;
ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_locale_check
  CHECK (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');

ALTER TABLE release_controls
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';
ALTER TABLE release_controls DROP CONSTRAINT IF EXISTS release_controls_pkey;
ALTER TABLE release_controls
  ADD CONSTRAINT release_controls_pkey PRIMARY KEY (country_code, control_key);

ALTER TABLE release_control_events
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZM';

CREATE INDEX IF NOT EXISTS listings_country_created_idx
  ON listings(country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_applications_country_created_idx
  ON seller_applications(country_code, accepted_at ASC);
CREATE INDEX IF NOT EXISTS delivery_options_country_active_idx
  ON delivery_options(country_code, delivery_mode) WHERE is_active;
CREATE INDEX IF NOT EXISTS payment_records_country_created_idx
  ON payment_records(country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS payout_records_country_created_idx
  ON payout_records(country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS release_control_events_country_created_idx
  ON release_control_events(country_code, created_at DESC);
