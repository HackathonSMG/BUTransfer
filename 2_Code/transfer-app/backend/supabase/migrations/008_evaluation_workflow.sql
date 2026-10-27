-- ============================================================
-- Migration 008: Evaluation workflow foundation
-- ============================================================
-- 1. Data provenance (internal only, never shown in the UI): data_source is 'sponsor' (the sponsor's
--    course-match workbook), 'synthetic' (written for the hackathon) or 'user' (created in the app).
-- 2. Sponsor course matches: the workbook's preliminary BU <-> peer course matches. Used as the
--    recommended target and match level; they never approve credit on their own.
-- 3. Evaluator master data: an evaluator code and the subjects/courses each evaluator can review.
-- 4. Course reviews: one per transcript course, assigned to an evaluator.
-- 5. Transfer requests: hand-offs of an application's remaining courses to the next evaluator.
-- migrate.js re-runs every file, so each backfill runs only when its column is first added.

-- ---------- 1. Provenance ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_courses' AND column_name = 'data_source') THEN
    -- Every catalog row so far was loaded from 3_Data, which flags all rows as synthetic
    ALTER TABLE catalog_courses ADD COLUMN data_source TEXT NOT NULL DEFAULT 'synthetic';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equivalencies' AND column_name = 'data_source') THEN
    ALTER TABLE equivalencies ADD COLUMN data_source TEXT NOT NULL DEFAULT 'user';
    UPDATE equivalencies SET data_source = 'synthetic' WHERE source = 'sample';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'past_decisions' AND column_name = 'data_source') THEN
    ALTER TABLE past_decisions ADD COLUMN data_source TEXT NOT NULL DEFAULT 'user';
    UPDATE past_decisions SET data_source = 'synthetic' WHERE source = 'sample';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'applications' AND column_name = 'data_source') THEN
    ALTER TABLE applications ADD COLUMN data_source TEXT NOT NULL DEFAULT 'user';
    -- seed-sample-students.js tags its applications with the 3_Data student id
    UPDATE applications SET data_source = 'synthetic' WHERE additional_info ? 'sample_student_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluators' AND column_name = 'data_source') THEN
    ALTER TABLE evaluators ADD COLUMN data_source TEXT NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- Where a sponsor row came from, and which catalog fields the sponsor did not supply
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS description_source TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS requirement_type   TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS verified           TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS notes              TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS source_url         TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS source_file        TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS source_record_id   TEXT;
ALTER TABLE catalog_courses ADD COLUMN IF NOT EXISTS imported_at        TIMESTAMPTZ;
ALTER TABLE equivalencies   ADD COLUMN IF NOT EXISTS source_file        TEXT;
ALTER TABLE equivalencies   ADD COLUMN IF NOT EXISTS source_record_id   TEXT;
ALTER TABLE past_decisions  ADD COLUMN IF NOT EXISTS source_file        TEXT;
ALTER TABLE past_decisions  ADD COLUMN IF NOT EXISTS source_record_id   TEXT;

DO $$ BEGIN ALTER TABLE catalog_courses ADD CONSTRAINT catalog_courses_data_source_check CHECK (data_source IN ('sponsor', 'synthetic', 'user')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE equivalencies   ADD CONSTRAINT equivalencies_data_source_check   CHECK (data_source IN ('sponsor', 'synthetic', 'user')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE past_decisions  ADD CONSTRAINT past_decisions_data_source_check  CHECK (data_source IN ('sponsor', 'synthetic', 'user')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE applications    ADD CONSTRAINT applications_data_source_check    CHECK (data_source IN ('sponsor', 'synthetic', 'user')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE evaluators      ADD CONSTRAINT evaluators_data_source_check      CHECK (data_source IN ('sponsor', 'synthetic', 'user')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 2. Sponsor course matches ----------
CREATE TABLE IF NOT EXISTS sponsor_course_matches (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  peer_institution  TEXT        NOT NULL,
  peer_course       TEXT        NOT NULL,
  bu_course         TEXT        NOT NULL,
  program           TEXT,
  match_level       TEXT        NOT NULL,
  notes             TEXT,
  data_source       TEXT        NOT NULL DEFAULT 'sponsor' CHECK (data_source IN ('sponsor', 'synthetic')),
  source_file       TEXT,
  source_record_id  TEXT,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (peer_institution, peer_course, bu_course)
);
CREATE INDEX IF NOT EXISTS idx_sponsor_matches_peer ON sponsor_course_matches(peer_institution, peer_course);

-- ---------- 3. Evaluator master data ----------
CREATE SEQUENCE IF NOT EXISTS evaluator_code_seq START 1001;
ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS evaluator_code     TEXT;
ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS title              TEXT;
-- BU subject codes the evaluator reviews (e.g. CS, MA, BI); GEN marks a general credit evaluator
ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS expertise_subjects TEXT[] NOT NULL DEFAULT '{}';
-- BU courses the evaluator is qualified to judge (e.g. CAS CS 111)
ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS expertise_courses  TEXT[] NOT NULL DEFAULT '{}';
UPDATE evaluators SET evaluator_code = 'EV-' || nextval('evaluator_code_seq') WHERE evaluator_code IS NULL;
ALTER TABLE evaluators ALTER COLUMN evaluator_code SET DEFAULT 'EV-' || nextval('evaluator_code_seq');
CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluators_code ON evaluators(evaluator_code);

-- ---------- 4. Course reviews ----------
-- queued: waits for an earlier evaluator on the same application; new: assigned, not opened;
-- in_progress: opened; info_requested: waiting on the student; approved / rejected: decided.
CREATE TABLE IF NOT EXISTS course_reviews (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id        UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  transcript_course_id  UUID          NOT NULL UNIQUE REFERENCES transcript_courses(id) ON DELETE CASCADE,
  evaluator_id          UUID          REFERENCES evaluators(id) ON DELETE SET NULL,
  status                TEXT          NOT NULL DEFAULT 'new'
                          CHECK (status IN ('queued', 'new', 'in_progress', 'info_requested', 'approved', 'rejected')),
  sequence              INTEGER       NOT NULL DEFAULT 1,
  priority              TEXT          NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  target_bu_course      TEXT,
  match_score           NUMERIC(3,2),
  match_basis           TEXT,
  sponsor_match_level   TEXT,
  assignment_reason     TEXT,
  info_request_id       UUID          REFERENCES information_requests(id) ON DELETE SET NULL,
  transfer_request_id   UUID,
  assigned_at           TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_course_reviews_evaluator ON course_reviews(evaluator_id, status);
CREATE INDEX IF NOT EXISTS idx_course_reviews_app       ON course_reviews(application_id, sequence);
DROP TRIGGER IF EXISTS trg_course_reviews_updated ON course_reviews;
CREATE TRIGGER trg_course_reviews_updated BEFORE UPDATE ON course_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 5. Transfer requests ----------
CREATE SEQUENCE IF NOT EXISTS transfer_request_number_seq START 1001;
CREATE TABLE IF NOT EXISTS transfer_requests (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_number     TEXT        NOT NULL UNIQUE DEFAULT 'TRF-' || nextval('transfer_request_number_seq'),
  application_id     UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_evaluator_id  UUID        REFERENCES evaluators(id) ON DELETE SET NULL,
  to_evaluator_id    UUID        REFERENCES evaluators(id) ON DELETE SET NULL,
  sequence           INTEGER     NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed')),
  priority           TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  reason             TEXT,
  previous_decisions JSONB       NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at        TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  UNIQUE (application_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_to ON transfer_requests(to_evaluator_id, status);
DO $$ BEGIN ALTER TABLE course_reviews ADD CONSTRAINT course_reviews_transfer_request_fk FOREIGN KEY (transfer_request_id) REFERENCES transfer_requests(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backend-only tables, like the other credit tables (005)
ALTER TABLE sponsor_course_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests      ENABLE ROW LEVEL SECURITY;
