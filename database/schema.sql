-- ============================================================
-- Jobcityjob — MySQL/MariaDB schema (PHP backend)
-- Port of the former Supabase (Postgres) schema:
--   supabase/migrations/0001_schema.sql
--   supabase/migrations/0002_payments_upgrade.sql
--
-- Notable changes from the Postgres version:
--   * jc_users now stores password_hash directly (no auth.users).
--   * IDs are application-generated strings (e.g. 32-char hex,
--     "emp<timestamp>", "pay<timestamp>", "post_<ts>", ...).
--   * jsonb -> JSON (MariaDB/MySQL alias for LONGTEXT + validation).
--   * boolean -> TINYINT(1).  timestamptz -> DATETIME.
--   * Writes are server-side only (PHP + prepared statements);
--     there is no Row Level Security concept — the API enforces
--     ownership + session checks instead (see api/).
--
-- Load:  mysql -u root -p jobcityjob < database/schema.sql
--   or:  mysql -u root -p -e "SOURCE database/schema.sql"  (from repo root)
-- ============================================================

CREATE DATABASE IF NOT EXISTS jobcityjob
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE jobcityjob;

-- ------------------------------------------------------------
-- 1. USERS  (accounts + employer message centre + ATS pipeline)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_users (
  id               VARCHAR(36)  NOT NULL,
  email            VARCHAR(255) NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  type             VARCHAR(20)  NOT NULL DEFAULT 'employee',   -- 'employee' | 'employer'
  name             VARCHAR(255) NULL,
  country          VARCHAR(120) NULL,
  avatar           VARCHAR(500) NULL,   -- server path/URL of the profile image (disk + DB)
  profile_complete TINYINT(1)   NOT NULL DEFAULT 0,
  messages         JSON         NULL,   -- employee message centre / unlocked contacts
  pipeline         JSON         NULL,   -- employer ATS pipeline
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. EMPLOYEES  (searchable talent profiles)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_employees (
  id                 VARCHAR(64)   NOT NULL,
  user_id            VARCHAR(36)   NOT NULL,
  -- Identity / personal
  full_name          VARCHAR(255)  NULL,
  preferred_name     VARCHAR(120)  NULL,
  avatar             VARCHAR(500)  NULL,   -- server path/URL of the employee photo
  dob                VARCHAR(40)   NULL,
  age                DECIMAL(4,1)  NULL,
  gender             VARCHAR(30)   NULL,
  marital            VARCHAR(40)   NULL,
  nationality        VARCHAR(120)  NULL,
  nationality_code   VARCHAR(4)    NULL,
  country            VARCHAR(120)  NULL,
  country_code       VARCHAR(4)    NULL,
  country_name       VARCHAR(120)  NULL,
  city               VARCHAR(120)  NULL,
  state              VARCHAR(120)  NULL,
  phone              VARCHAR(40)   NULL,
  whatsapp           VARCHAR(40)   NULL,
  phone2             VARCHAR(40)   NULL,
  email              VARCHAR(255)  NULL,
  address            VARCHAR(255)  NULL,
  postal             VARCHAR(40)   NULL,
  -- Education
  education          VARCHAR(120)  NULL,
  field_of_study     VARCHAR(120)  NULL,
  institution        VARCHAR(255)  NULL,
  grad_year          VARCHAR(20)   NULL,
  certifications     TEXT          NULL,
  -- Employment
  experience_years   DECIMAL(4,1)  NOT NULL DEFAULT 0,
  job_title          VARCHAR(120)  NULL,
  industry           VARCHAR(120)  NULL,
  job_category       VARCHAR(120)  NULL,
  skills             JSON          NULL,
  availability       VARCHAR(80)   NULL,
  work_type          VARCHAR(80)   NULL,
  relocate           VARCHAR(80)   NULL,
  preferred_locations VARCHAR(255) NULL,
  salary_min         DECIMAL(12,2) NULL,
  salary_currency    VARCHAR(10)   NULL,
  salary_period      VARCHAR(40)   NULL,
  summary            TEXT          NULL,
  resume_text        LONGTEXT      NULL,
  -- ID verification
  id_type            VARCHAR(120)  NULL,
  id_number          VARCHAR(120)  NULL,
  id_country         VARCHAR(120)  NULL,
  id_country_code    VARCHAR(4)    NULL,
  id_verified        TINYINT(1)    NOT NULL DEFAULT 0,
  -- References
  ref_name           VARCHAR(120)  NULL,
  ref_relation       VARCHAR(80)   NULL,
  ref_phone          VARCHAR(40)   NULL,
  ref_email          VARCHAR(255)  NULL,
  ref_org            VARCHAR(120)  NULL,
  -- Country-specific extras
  extra              JSON          NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employees_user (user_id),
  KEY idx_employees_job (job_title),
  KEY idx_employees_country (country),
  KEY idx_employees_industry (industry),
  KEY idx_employees_gender (gender),
  CONSTRAINT fk_employees_user FOREIGN KEY (user_id)
    REFERENCES jc_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. PAYMENTS  (employer unlock / base fee payments)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_payments (
  id             VARCHAR(64)   NOT NULL,
  employer_id    VARCHAR(36)   NULL,
  employer_email VARCHAR(255)  NULL,
  candidate_ids  JSON          NULL,
  method         VARCHAR(40)   NULL,                          -- paystack | bank_transfer
  status         VARCHAR(40)   NOT NULL DEFAULT 'pending_confirmation', -- pending_confirmation | confirmed | refunded | pending
  ref            VARCHAR(100)  NULL,                          -- paid + recovered reference
  currency       VARCHAR(10)   NOT NULL DEFAULT 'NGN',
  amount_ngn     DECIMAL(12,2) NULL,
  amount_usd     DECIMAL(12,2) NULL,
  amount_kobo    BIGINT        NULL,
  amount_label   VARCHAR(120)  NULL,
  confirmed_at   DATETIME      NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_ref (ref),
  KEY idx_payments_employer (employer_id),
  KEY idx_payments_employer_status (employer_id, status),
  KEY idx_payments_status (status),
  KEY idx_payments_created_at (created_at),
  KEY idx_payments_method (method),
  CONSTRAINT fk_payments_employer FOREIGN KEY (employer_id)
    REFERENCES jc_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. UNLOCKS  (audit trail of every credential delivered)
--    Written ONLY by the PHP paystack-verify endpoint. No browser
--    endpoint writes here, so a client can never grant itself
--    access to candidate contacts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_unlocks (
  id               VARCHAR(128) NOT NULL,              -- e.g. unl_<paymentId>_<candidateId>
  payment_id       VARCHAR(64)  NOT NULL,
  employer_id      VARCHAR(36)  NOT NULL,
  candidate_id     VARCHAR(64)  NOT NULL,
  method           VARCHAR(40)  NULL,
  source           VARCHAR(40)  NOT NULL DEFAULT 'edge',-- edge (PHP verify) | admin
  amount_ngn       DECIMAL(12,2) NULL,
  amount_usd       DECIMAL(12,2) NULL,
  -- Snapshot of delivered credentials
  candidate_name   VARCHAR(255) NULL,
  phone            VARCHAR(40)  NULL,
  whatsapp         VARCHAR(40)  NULL,
  email            VARCHAR(255) NULL,
  job_title        VARCHAR(120) NULL,
  city             VARCHAR(120) NULL,
  country          VARCHAR(120) NULL,
  education        VARCHAR(120) NULL,
  experience_years DECIMAL(4,1) NULL,
  skills           JSON         NULL,
  resume_text      LONGTEXT     NULL,
  unlocked_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_unlocks_employer (employer_id),
  KEY idx_unlocks_payment (payment_id),
  KEY idx_unlocks_candidate (candidate_id),
  KEY idx_unlocks_employer_candidate (employer_id, candidate_id),
  KEY idx_unlocks_unlocked_at (unlocked_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. BLOG  (community success stories)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_blog (
  id         VARCHAR(64)   NOT NULL,
  author     VARCHAR(255)  NULL,
  role       VARCHAR(120)  NULL,
  title      VARCHAR(255)  NULL,
  body       LONGTEXT      NULL,
  likes      INT           NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_blog_likes (likes),
  KEY idx_blog_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. RATINGS  (testimonials)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_ratings (
  id         VARCHAR(64)  NOT NULL,
  name       VARCHAR(255) NULL,
  role       VARCHAR(120) NULL,
  stars      INT          NULL,
  feel       VARCHAR(120) NULL,
  recommend  VARCHAR(40)  NULL,
  comment    TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ratings_created_at (created_at),
  CONSTRAINT chk_ratings_stars CHECK (stars IS NULL OR (stars BETWEEN 1 AND 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. EMAIL EVENTS  (interview invites, email delivery/bounce)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_email_events (
  id           VARCHAR(64)  NOT NULL,
  email        VARCHAR(255) NULL,
  status       VARCHAR(80)  NULL,
  message_id   VARCHAR(255) NULL,
  subject      VARCHAR(255) NULL,
  channel      VARCHAR(40)  NULL,
  invite_date  VARCHAR(40)  NULL,
  invite_time  VARCHAR(40)  NULL,
  venue        VARCHAR(255) NULL,
  note         TEXT         NULL,
  candidate_id VARCHAR(64)  NULL,
  employer_id  VARCHAR(36)  NULL,
  bounce_type  VARCHAR(120) NULL,
  reason       TEXT         NULL,
  provider     VARCHAR(120) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_candidate (candidate_id),
  KEY idx_email_status (status),
  KEY idx_email_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. SETTINGS  (key/value store: bank details, etc.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_settings (
  `key`       VARCHAR(120) NOT NULL,
  `value`     JSON         NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. RATE LIMITS  (CSRF + fixed-window per-IP/per-route limits)
--    helpers.php jcj_rate_limit() inserts/updates rows here. The table is
--    additive and idempotent (CREATE IF NOT EXISTS) so it's safe to add to
--    an existing install; the installer guards re-runs.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jc_rate_limits (
  rl_key      VARCHAR(64)  NOT NULL,   -- unique bucket|ip|route key
  bucket      VARCHAR(80)  NOT NULL,   -- logical bucket, e.g. 'auth.signin'
  ip          VARCHAR(64)  NULL,       -- client IP for per-IP caps
  window_start INT         NOT NULL,   -- fixed-window start (unix seconds)
  count       INT          NOT NULL DEFAULT 1,   -- requests seen in the window
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rl_key),
  KEY idx_rl_bucket (bucket),
  KEY idx_rl_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;