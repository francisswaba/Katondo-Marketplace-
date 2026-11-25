-- Buyer–seller messaging. One conversation per buyer per listing.
-- Switched off (MESSAGING_ENABLED) until sign-in is live. Message text is never copied into
-- activity or audit logs; staff read a conversation only through a report, and each read is audited.

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  listing_title TEXT NOT NULL,
  buyer_user_id UUID NOT NULL REFERENCES users(id),
  -- First name only, from the buyer's sign-in profile, so sellers can tell conversations apart.
  buyer_display_name TEXT NOT NULL DEFAULT 'Buyer',
  seller_id UUID NOT NULL REFERENCES sellers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  buyer_last_read_at TIMESTAMPTZ,
  seller_last_read_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_buyer_unique ON conversations(listing_id, buyer_user_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_buyer_recent_idx ON conversations(buyer_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_seller_recent_idx ON conversations(seller_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('buyer', 'seller')),
  sender_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- Why the recipient sees a safety warning, e.g. {'phone_number','off_platform_payment'}.
  flags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'removed')),
  removed_reason TEXT,
  removed_by_user_id UUID REFERENCES users(id),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'removed' OR (removed_reason IS NOT NULL AND removed_by_user_id IS NOT NULL AND removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_created_idx ON messages(sender_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS conversation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (reason IN ('scam', 'abuse', 'spam', 'other')),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note TEXT,
  resolved_by_user_id UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'resolved' OR (resolution_note IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS conversation_reports_status_idx ON conversation_reports(status, created_at DESC);
