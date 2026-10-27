-- ============================================================
-- Migration 001: Core Schema
-- Transfer Credit Evaluation System - Boston University
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('student', 'evaluator', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE application_status AS ENUM ('draft','submitted','information_required','under_evaluation','evaluation_completed','under_evaluator_review','approved','rejected','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE application_source AS ENUM ('website', 'email', 'evaluator_submitted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE document_type AS ENUM ('transcript', 'syllabus', 'identification', 'supporting', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ai_eval_status AS ENUM ('pending', 'running', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE info_req_status AS ENUM ('pending', 'responded', 'resolved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        user_role   NOT NULL DEFAULT 'student',
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  phone       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluators (
  id                    UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  department            TEXT,
  specializations       TEXT[]      DEFAULT '{}',
  max_concurrent_cases  INTEGER     NOT NULL DEFAULT 20,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eligibility_criteria (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  criterion_name   TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  rule_type        TEXT        NOT NULL,
  rule_config      JSONB       NOT NULL DEFAULT '{}',
  is_required      BOOLEAN     NOT NULL DEFAULT true,
  display_order    INTEGER     NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  version          INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id                        UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_number          TEXT               NOT NULL UNIQUE,
  source                    application_source NOT NULL DEFAULT 'website',
  status                    application_status NOT NULL DEFAULT 'draft',
  student_profile_id        UUID               REFERENCES profiles(id) ON DELETE SET NULL,
  student_name              TEXT               NOT NULL,
  student_email             TEXT               NOT NULL,
  student_phone             TEXT,
  date_of_birth             DATE,
  transfer_from_institution TEXT               NOT NULL,
  transfer_from_program     TEXT,
  transfer_to_program       TEXT               NOT NULL,
  transfer_to_department    TEXT,
  expected_start_term       TEXT,
  academic_history          JSONB              DEFAULT '{}',
  personal_statement        TEXT,
  additional_info           JSONB              DEFAULT '{}',
  secure_token              UUID               NOT NULL DEFAULT uuid_generate_v4(),
  assigned_evaluator_id     UUID               REFERENCES evaluators(id) ON DELETE SET NULL,
  submitted_at              TIMESTAMPTZ,
  final_decision            TEXT,
  evaluator_comments        TEXT,
  decision_date             TIMESTAMPTZ,
  created_by                UUID               REFERENCES profiles(id) ON DELETE SET NULL,
  duplicate_of              UUID               REFERENCES applications(id),
  policy_version            TEXT               DEFAULT '1.0',
  created_at                TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_documents (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id   UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_type    document_type NOT NULL DEFAULT 'other',
  file_name        TEXT          NOT NULL,
  storage_path     TEXT          NOT NULL,
  file_size        INTEGER,
  mime_type        TEXT,
  uploaded_by      UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  upload_source    TEXT          NOT NULL DEFAULT 'student',
  is_verified      BOOLEAN       DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_evaluations (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id    UUID           NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  agent_run_id      TEXT,
  status            ai_eval_status NOT NULL DEFAULT 'pending',
  policy_version    TEXT           DEFAULT '1.0',
  criteria_results  JSONB          DEFAULT '[]',
  missing_documents JSONB          DEFAULT '[]',
  flags             JSONB          DEFAULT '[]',
  recommendations   TEXT,
  evaluation_report TEXT,
  confidence_score  DECIMAL(3,2),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  attempt_number    INTEGER        NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS information_requests (
  id               UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id   UUID            NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  requested_by     UUID            REFERENCES evaluators(id) ON DELETE SET NULL,
  items            JSONB           NOT NULL DEFAULT '[]',
  message          TEXT,
  status           info_req_status NOT NULL DEFAULT 'pending',
  student_response TEXT,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id   UUID        REFERENCES applications(id) ON DELETE SET NULL,
  action           TEXT        NOT NULL,
  actor_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role       user_role,
  actor_email      TEXT,
  old_value        JSONB,
  new_value        JSONB,
  details          JSONB       DEFAULT '{}',
  ip_address       INET,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id     UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_email  TEXT,
  application_id   UUID        REFERENCES applications(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  message          TEXT        NOT NULL,
  data             JSONB       DEFAULT '{}',
  is_read          BOOLEAN     NOT NULL DEFAULT false,
  sent_at          TIMESTAMPTZ DEFAULT NOW(),
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_status    ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_source    ON applications(source);
CREATE INDEX IF NOT EXISTS idx_applications_email     ON applications(student_email);
CREATE INDEX IF NOT EXISTS idx_applications_token     ON applications(secure_token);
CREATE INDEX IF NOT EXISTS idx_applications_evaluator ON applications(assigned_evaluator_id);
CREATE INDEX IF NOT EXISTS idx_applications_created   ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_evals_application   ON ai_evaluations(application_id);
CREATE INDEX IF NOT EXISTS idx_docs_application       ON application_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_audit_application      ON audit_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_audit_created          ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_recipient        ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread           ON notifications(recipient_id) WHERE is_read = false;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_applications_updated ON applications;
CREATE TRIGGER trg_applications_updated BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_criteria_updated ON eligibility_criteria;
CREATE TRIGGER trg_criteria_updated BEFORE UPDATE ON eligibility_criteria FOR EACH ROW EXECUTE FUNCTION set_updated_at();
