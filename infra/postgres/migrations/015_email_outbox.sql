-- Emails are queued here and sent in the background, so a slow or unavailable
-- email provider never blocks a request and failed sends are retried.
CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox(next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS email_outbox_dedupe_idx ON email_outbox(dedupe_key, created_at DESC) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_outbox_created_idx ON email_outbox(created_at);

-- Optional "someone messaged you" emails; on by default, can be switched off in account settings.
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS message_emails BOOLEAN NOT NULL DEFAULT TRUE;
