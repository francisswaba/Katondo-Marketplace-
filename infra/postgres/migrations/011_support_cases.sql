-- Help and complaints: one case per grievance, with a public reference, a conversation
-- between the requester and staff, target response times, assignment, and one appeal.
-- Switched off (SUPPORT_ENABLED) until sign-in is live. Every staff action is written to audit_events.

CREATE SEQUENCE IF NOT EXISTS support_case_number_seq;

CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('order_problem', 'report_listing', 'report_shop', 'report_review', 'account', 'seller_decision', 'privacy_request', 'other')),
  summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 3 AND 140),
  -- What the case is about, when it's about something on Katondo.
  subject_type TEXT CHECK (subject_type IN ('listing', 'seller', 'review', 'order')),
  subject_id UUID,
  subject_label TEXT,
  report_reason TEXT CHECK (report_reason IN ('counterfeit', 'prohibited', 'scam', 'misleading', 'offensive', 'other')),
  privacy_request_type TEXT CHECK (privacy_request_type IN ('access', 'correction', 'deletion', 'objection', 'other')),
  -- A signed-in requester, or (for privacy requests only) contact details from someone without an account.
  requester_user_id UUID REFERENCES users(id),
  contact_name TEXT CHECK (contact_name IS NULL OR char_length(contact_name) <= 120),
  contact_email TEXT CHECK (contact_email IS NULL OR char_length(contact_email) <= 254),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_review', 'waiting_on_requester', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  assigned_to_user_id UUID REFERENCES users(id),
  first_response_due_at TIMESTAMPTZ NOT NULL,
  resolution_due_at TIMESTAMPTZ NOT NULL,
  first_response_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IS NULL OR char_length(resolution) <= 2000),
  resolved_by_user_id UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  appeal_of_case_id UUID REFERENCES support_cases(id),
  requester_last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_user_id IS NOT NULL OR (category = 'privacy_request' AND contact_email IS NOT NULL)),
  CHECK ((subject_type IS NULL) = (subject_id IS NULL)),
  CHECK (status <> 'resolved' OR (resolution IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL))
);

-- A decision can be appealed once.
CREATE UNIQUE INDEX IF NOT EXISTS support_cases_one_appeal ON support_cases(appeal_of_case_id) WHERE appeal_of_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_cases_requester_idx ON support_cases(requester_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_cases_queue_idx ON support_cases(status, first_response_due_at);
CREATE INDEX IF NOT EXISTS support_cases_subject_idx ON support_cases(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS support_case_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('requester', 'staff', 'system')),
  author_user_id UUID REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- Staff-only notes the requester never sees.
  internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (author_type = 'staff' OR internal = FALSE)
);

CREATE INDEX IF NOT EXISTS support_case_messages_case_idx ON support_case_messages(case_id, created_at);
