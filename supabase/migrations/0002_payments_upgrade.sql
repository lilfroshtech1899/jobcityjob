-- ============================================================
-- Jobcityjob — payment & credential-delivery upgrade
-- Run this AFTER 0001_schema.sql (or after the base schema,
-- if it is already deployed).
--
-- Adds:
--   1. jc_unlocks  — audit trail of every worker credential
--      delivered to an employer after a confirmed payment.
--   2. Indexes on jc_payments for the verification + admin flows.
--   3. RLS policies for jc_unlocks.
--
-- Flow it supports (card / paystack):
--   jc_payments (status confirmed)
--        → unlockContacts() / confirmAndUnlockPayment()
--        → jc_unlocks row per candidate: phone, whatsapp, email, ...
--        → employer sees the credentials in their Message Centre.
-- ============================================================

-- ------------------------------------------------------------
-- 1. UNLOCKS — "who got which worker's credentials, when, under
--    which payment". One row per candidate per payment.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_unlocks (
  id             text PRIMARY KEY,            -- e.g. "unl_<paymentId>_<candidateId>"
  payment_id     text NOT NULL,               -- jc_payments.id
  employer_id    text NOT NULL,               -- jc_users.id (employer)
  candidate_id   text NOT NULL,               -- jc_employees.id
  method         text,                        -- paystack | bank_transfer
  source         text DEFAULT 'admin',        -- edge (auto verify) | admin | fallback
  amount_ngn     numeric,
  amount_usd     numeric,
  -- Snapshot of delivered credentials
  candidate_name text,
  phone          text,
  whatsapp       text,
  email          text,
  job_title      text,
  city           text,
  country        text,
  education      text,
  experience_years numeric,
  skills         jsonb DEFAULT '[]'::jsonb,
  resume_text    text,
  unlocked_at    timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unlocks_employer      ON jc_unlocks (employer_id);
CREATE INDEX IF NOT EXISTS idx_unlocks_payment       ON jc_unlocks (payment_id);
CREATE INDEX IF NOT EXISTS idx_unlocks_candidate     ON jc_unlocks (candidate_id);
CREATE INDEX IF NOT EXISTS idx_unlocks_unlocked_at   ON jc_unlocks (unlocked_at DESC);

-- ------------------------------------------------------------
-- 2. PAYMENTS — speed up the flows the site actually runs:
--    edge-function verify (by id), admin list (by status),
--    employer dashboard (by employer), uniqueness of ref.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_ref_unique ON jc_payments (ref);
CREATE INDEX IF NOT EXISTS idx_payments_employer_status ON jc_payments (employer_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON jc_payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_method ON jc_payments (method);

-- ------------------------------------------------------------
-- 3. RLS for jc_unlocks  (authenticated read/write; the edge
--    function operates with the service role and bypasses RLS).
-- ------------------------------------------------------------
ALTER TABLE jc_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read unlocks" ON jc_unlocks;
CREATE POLICY "auth read unlocks"
  ON jc_unlocks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert unlocks" ON jc_unlocks;
CREATE POLICY "auth insert unlocks"
  ON jc_unlocks FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth delete unlocks" ON jc_unlocks;
CREATE POLICY "auth delete unlocks"
  ON jc_unlocks FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;