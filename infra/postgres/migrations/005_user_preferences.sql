CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en-ZM' CHECK (locale IN ('en-ZM', 'en')),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  marketing_emails BOOLEAN NOT NULL DEFAULT FALSE,
  marketplace_updates BOOLEAN NOT NULL DEFAULT TRUE,
  order_updates BOOLEAN NOT NULL DEFAULT TRUE,
  saved_search_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  seller_activity_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  staff_operational_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_preferences_updated_idx ON user_preferences(updated_at DESC);
