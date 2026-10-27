-- ============================================================
-- Migration 005: Transfer credit reference data and per-course evaluation
-- ============================================================
-- Reference tables are loaded from the hackathon sample data by `npm run db:seed:credit`.
-- RLS is enabled without policies: only the backend (table owner) reads and writes these tables.

CREATE TABLE IF NOT EXISTS catalog_courses (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution       TEXT          NOT NULL,
  course_code       TEXT          NOT NULL,
  title             TEXT          NOT NULL,
  program           TEXT,
  credits           NUMERIC(5,2),
  credit_system     TEXT,
  level             TEXT,
  description       TEXT,
  learning_outcomes TEXT,
  syllabus          TEXT,
  UNIQUE (institution, course_code)
);

CREATE TABLE IF NOT EXISTS equivalencies (
  eq_id        TEXT          PRIMARY KEY,
  institution  TEXT          NOT NULL,
  course_code  TEXT          NOT NULL,
  title        TEXT,
  bu_course    TEXT,
  outcome      TEXT          NOT NULL,
  dept         TEXT,
  approved_on  DATE,
  evaluator    TEXT,
  UNIQUE (institution, course_code)
);

CREATE TABLE IF NOT EXISTS past_decisions (
  decision_id      TEXT      PRIMARY KEY,
  institution      TEXT      NOT NULL,
  course_code      TEXT      NOT NULL,
  proposed_bu      TEXT,
  decision         TEXT      NOT NULL,
  bu_awarded       TEXT,
  reason           TEXT,
  credit_system    TEXT,
  decided_on       DATE,
  evaluator        TEXT,
  days_to_decision INTEGER
);

CREATE TABLE IF NOT EXISTS transfer_rules (
  rule_id     TEXT PRIMARY KEY,
  rule        TEXT NOT NULL,
  detail      TEXT,
  applies_to  TEXT,
  source      TEXT
);

CREATE TABLE IF NOT EXISTS transcript_courses (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id  UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_id     UUID          REFERENCES application_documents(id) ON DELETE CASCADE,
  position        INTEGER       NOT NULL,
  institution     TEXT          NOT NULL,
  course_code     TEXT          NOT NULL,
  title           TEXT,
  term            TEXT,
  credit_system   TEXT,
  source_credits  NUMERIC(5,2),
  grade           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_evaluations (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id        UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  ai_evaluation_id      UUID          NOT NULL REFERENCES ai_evaluations(id) ON DELETE CASCADE,
  transcript_course_id  UUID          NOT NULL REFERENCES transcript_courses(id) ON DELETE CASCADE,
  path                  TEXT          NOT NULL,
  outcome               TEXT          NOT NULL,
  award                 TEXT,
  suggestion            TEXT,
  bu_credits            NUMERIC(5,2),
  confidence            NUMERIC(3,2),
  rules                 TEXT[]        NOT NULL DEFAULT '{}',
  precedent_ids         TEXT[]        NOT NULL DEFAULT '{}',
  equivalency_id        TEXT,
  candidates            JSONB         NOT NULL DEFAULT '[]',
  reasons               JSONB         NOT NULL DEFAULT '[]',
  engine_version        TEXT          NOT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_evaluations ADD COLUMN IF NOT EXISTS credit_summary JSONB;

CREATE INDEX IF NOT EXISTS idx_past_decisions_course   ON past_decisions(institution, course_code);
CREATE INDEX IF NOT EXISTS idx_transcript_courses_app  ON transcript_courses(application_id, position);
CREATE INDEX IF NOT EXISTS idx_course_evals_evaluation ON course_evaluations(ai_evaluation_id);

ALTER TABLE catalog_courses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE equivalencies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_decisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_evaluations ENABLE ROW LEVEL SECURITY;
