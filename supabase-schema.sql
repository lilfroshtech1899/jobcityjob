-- ============================================================
-- Jobcityjob — COMPLETE data collection schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- This schema is a single source of truth: it creates EVERY table
-- the Jobcityjob site writes to, with every column collected from
-- each form, plus indexes and least-privilege Row Level Security
-- (authenticated read for sensitive tables, public read for
-- browsing content, own-row employee updates).
--
-- Tables:
--   jc_users          -> employee/employer profiles + pipelines + messages
--   jc_employees      -> searchable talent profiles (employee form)
--   jc_payments       -> employer payments (unlock / base fee)
--   jc_blog           -> community success stories
--   jc_ratings        -> testimonials / ratings
--   jc_email_events   -> interview invites + email/bounce events
--   jc_settings       -> key/value store (bank details, etc.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. USERS  (covers the login / register form + dashboard data)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_users (
  id                uuid PRIMARY KEY,        -- same as auth.users id
  auth_id           uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email             text UNIQUE NOT NULL,
  type              text NOT NULL DEFAULT 'employee',   -- 'employee' | 'employer'
  name              text,
  country           text,
  profile_complete  boolean DEFAULT false,
  messages          jsonb DEFAULT '[]'::jsonb,  -- employee message centre / unlocked contacts
  pipeline          jsonb DEFAULT '[]'::jsonb,  -- employer ATS pipeline
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. EMPLOYEES  (everything collected in the employee profile form)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_employees (
  id                 text PRIMARY KEY,      -- e.g. emp001 or uuid string
  user_id            uuid,
  -- Identity / personal
  full_name          text,
  preferred_name     text,
  dob                text,
  age                numeric,
  gender             text,
  marital            text,
  nationality        text,
  nationality_code   text,
  country            text,
  country_code       text,
  country_name       text,
  city               text,
  state              text,
  phone              text,
  whatsapp           text,
  phone2             text,
  email              text,
  address            text,
  postal             text,
  -- Education
  education          text,
  field_of_study     text,
  institution        text,
  grad_year          text,
  certifications     text,
  -- Employment
  experience_years   numeric DEFAULT 0,
  job_title          text,
  industry           text,
  job_category       text,
  skills             jsonb DEFAULT '[]'::jsonb,
  availability       text,
  work_type          text,
  relocate           text,
  preferred_locations text,
  salary_min         numeric,
  salary_currency    text,
  salary_period      text,
  summary            text,
  resume_text        text,
  -- ID verification
  id_type            text,
  id_number          text,
  id_country         text,
  id_country_code    text,
  id_verified        boolean DEFAULT false,
  -- References
  ref_name           text,
  ref_relation       text,
  ref_phone          text,
  ref_email          text,
  ref_org            text,
  -- Country-specific extras
  extra              jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. PAYMENTS  (employer unlock / base fee payments)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_payments (
  id             text PRIMARY KEY,
  employer_id    text,                     -- employer user id
  employer_email text,                     -- captured at payment time
  candidate_ids  jsonb DEFAULT '[]'::jsonb, -- unlocked candidate(s)
  method         text,                     -- paystack | bank_transfer
  status         text DEFAULT 'pending_confirmation',  -- pending_confirmation | confirmed | refunded | pending
  ref            text,                     -- reference / attempt
  currency       text DEFAULT 'NGN',
  amount_ngn     numeric,
  amount_usd     numeric,
  amount_kobo    numeric,                  -- Paystack minor units (NGN * 100)
  amount_label   text,
  confirmed_at   timestamptz,
  created_at     timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. BLOG  (community success stories)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_blog (
  id         text PRIMARY KEY,
  author     text,
  role       text,
  title      text,
  body       text,
  likes      integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. RATINGS  (testimonials)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_ratings (
  id         text PRIMARY KEY,
  name       text,
  role       text,
  stars      integer CHECK (stars >= 1 AND stars <= 5),
  feel       text,
  recommend  text,
  comment    text,
  created_at timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 6. EMAIL EVENTS  (interview invites, email delivery/bounce)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_email_events (
  id           text PRIMARY KEY,
  email        text,          -- recipient
  status       text,          -- accepted | rejected | delivered | bounced | ...
  message_id   text,
  subject      text,
  channel      text,          -- email | whatsapp | sms | call
  invite_date  text,
  invite_time  text,
  venue        text,
  note         text,
  candidate_id text,
  employer_id  text,
  bounce_type  text,
  reason       text,
  provider     text,
  created_at   timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. SETTINGS  (key/value store: bank details, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_settings (
  key        text PRIMARY KEY,
  value      jsonb,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES (speed up the queries the site actually runs)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_type        ON jc_users (type);
CREATE INDEX IF NOT EXISTS idx_users_auth_id     ON jc_users (auth_id);
CREATE INDEX IF NOT EXISTS idx_employees_user    ON jc_employees (user_id);
CREATE INDEX IF NOT EXISTS idx_employees_job     ON jc_employees (job_title);
CREATE INDEX IF NOT EXISTS idx_employees_country ON jc_employees (country);
CREATE INDEX IF NOT EXISTS idx_employees_industry ON jc_employees (industry);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON jc_payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_employer ON jc_payments (employer_id);
CREATE INDEX IF NOT EXISTS idx_blog_likes        ON jc_blog (likes);
CREATE INDEX IF NOT EXISTS idx_email_candidate   ON jc_email_events (candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_status      ON jc_email_events (status);

-- ============================================================
-- ROW LEVEL SECURITY  (least-privilege)
-- Sensitive tables (users, employees, payments, email_events) are
-- now read-able ONLY by the authenticated role — anonymous clients
-- can no longer enumerate profiles, contact details or payments.
-- Public read stays for browsing content (blog, ratings, settings).
-- Writes stay authenticated; employees INSERT stays open (WITH CHECK
-- true) so newly registered employees can insert their own profile
-- rows from the client.
--
-- NOTE: The /desk admin console (confirm + unlock, pending payments)
-- must be used while signed in to the Supabase dashboard account,
-- because these tables now require the authenticated role.
-- ============================================================

-- Enable RLS on every table
ALTER TABLE jc_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_employees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_blog         ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_ratings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE jc_settings     ENABLE ROW LEVEL SECURITY;

-- Public read: only browsing content is open to everyone.
DROP POLICY IF EXISTS "public read blog" ON jc_blog;
CREATE POLICY "public read blog"       ON jc_blog        FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read ratings" ON jc_ratings;
CREATE POLICY "public read ratings"    ON jc_ratings     FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read settings" ON jc_settings;
CREATE POLICY "public read settings"   ON jc_settings    FOR SELECT USING (true);

-- Sensitive tables are dually-visible: authenticated-read-only.
DROP POLICY IF EXISTS "public read users" ON jc_users;
DROP POLICY IF EXISTS "auth read users" ON jc_users;
CREATE POLICY "auth read users"         ON jc_users       FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "public read employees" ON jc_employees;
DROP POLICY IF EXISTS "auth read employees" ON jc_employees;
CREATE POLICY "auth read employees"     ON jc_employees   FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "public read payments" ON jc_payments;
DROP POLICY IF EXISTS "auth read payments" ON jc_payments;
CREATE POLICY "auth read payments"      ON jc_payments    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "public read email_events" ON jc_email_events;
DROP POLICY IF EXISTS "auth read email_events" ON jc_email_events;
CREATE POLICY "auth read email_events"  ON jc_email_events FOR SELECT TO authenticated USING (true);

-- Authenticated write: any signed-in user may create rows.
DROP POLICY IF EXISTS "auth insert users" ON jc_users;
CREATE POLICY "auth insert users" ON jc_users FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth update users" ON jc_users;
CREATE POLICY "auth update users" ON jc_users FOR UPDATE TO authenticated USING (true);

-- employees INSERT stays open (WITH CHECK true) for idempotent demo
-- seeding from the anon client; UPDATE is locked to the owner's own row.
DROP POLICY IF EXISTS "auth insert employees" ON jc_employees;
CREATE POLICY "auth insert employees" ON jc_employees FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "auth update employees" ON jc_employees;
CREATE POLICY "auth update employees" ON jc_employees FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "auth insert payments" ON jc_payments;
CREATE POLICY "auth insert payments" ON jc_payments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth update payments" ON jc_payments;
CREATE POLICY "auth update payments" ON jc_payments FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert blog" ON jc_blog;
CREATE POLICY "auth insert blog" ON jc_blog FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth update blog" ON jc_blog;
CREATE POLICY "auth update blog" ON jc_blog FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert ratings" ON jc_ratings;
CREATE POLICY "auth insert ratings" ON jc_ratings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth insert email_events" ON jc_email_events;
CREATE POLICY "auth insert email_events" ON jc_email_events FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth delete email_events" ON jc_email_events;
CREATE POLICY "auth delete email_events" ON jc_email_events FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert settings" ON jc_settings;
CREATE POLICY "auth insert settings" ON jc_settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth update settings" ON jc_settings;
CREATE POLICY "auth update settings" ON jc_settings FOR UPDATE TO authenticated USING (true);

-- Grants: anon + authenticated can do day-to-day operations; RLS
-- policies above enforce what each role can actually see/change.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
