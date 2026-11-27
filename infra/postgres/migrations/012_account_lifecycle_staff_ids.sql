-- Account lifecycle (closing with a 30-day restore), lost-email recovery cases, and staff identifiers.

-- Accounts: closing hides the account at once; it can be restored for 30 days, then it is anonymised.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS identity_object_id TEXT,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'pending_deletion', 'deleted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_deletion_dates_check
    CHECK (status <> 'pending_deletion' OR (deletion_requested_at IS NOT NULL AND deletion_due_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Anonymised (deleted) accounts keep no email or phone; every other account still needs one.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_contact_check CHECK (status = 'deleted' OR email IS NOT NULL OR phone IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS users_deletion_due_idx ON users(deletion_due_at) WHERE status = 'pending_deletion';

-- Listings paused because their seller closed the account come back when the account is restored.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS paused_reason TEXT;

-- Staff identifiers: a staff number customers can check, plus department (job_title already exists).
CREATE SEQUENCE IF NOT EXISTS staff_number_seq;
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS staff_number TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT CHECK (department IS NULL OR char_length(department) <= 80);
UPDATE staff_members SET staff_number = 'S-' || lpad(nextval('staff_number_seq')::text, 4, '0') WHERE staff_number IS NULL;
ALTER TABLE staff_members ALTER COLUMN staff_number SET DEFAULT 'S-' || lpad(nextval('staff_number_seq')::text, 4, '0');
ALTER TABLE staff_members ALTER COLUMN staff_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_staff_number_unique ON staff_members(staff_number);

-- Lost-email recovery is a help case from someone who can't sign in.
ALTER TABLE support_cases DROP CONSTRAINT IF EXISTS support_cases_category_check;
ALTER TABLE support_cases ADD CONSTRAINT support_cases_category_check CHECK (category IN (
  'order_problem', 'report_listing', 'report_shop', 'report_review', 'account', 'seller_decision',
  'privacy_request', 'account_recovery', 'other'));
ALTER TABLE support_cases DROP CONSTRAINT IF EXISTS support_cases_check;
ALTER TABLE support_cases ADD CONSTRAINT support_cases_requester_check CHECK (
  requester_user_id IS NOT NULL OR (category IN ('privacy_request', 'account_recovery') AND contact_email IS NOT NULL));

ALTER TABLE support_cases
  ADD COLUMN IF NOT EXISTS recovery_account_email TEXT CHECK (recovery_account_email IS NULL OR char_length(recovery_account_email) <= 254),
  ADD COLUMN IF NOT EXISTS contact_phone TEXT CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 40),
  -- No staff decision on a recovery before this time, so the real owner has time to object.
  ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_verified_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_evidence TEXT CHECK (identity_evidence IS NULL OR char_length(identity_evidence) <= 2000),
  ADD COLUMN IF NOT EXISTS recovery_outcome TEXT CHECK (recovery_outcome IS NULL OR recovery_outcome IN ('approved', 'declined'));

DO $$ BEGIN
  ALTER TABLE support_cases ADD CONSTRAINT support_cases_recovery_fields_check CHECK (
    category <> 'account_recovery' OR (recovery_account_email IS NOT NULL AND hold_until IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- An approved recovery needs an identity check by someone other than the person who decided it.
  ALTER TABLE support_cases ADD CONSTRAINT support_cases_recovery_two_people_check CHECK (
    recovery_outcome IS DISTINCT FROM 'approved'
    OR (identity_verified_by_user_id IS NOT NULL AND identity_verified_by_user_id <> resolved_by_user_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
