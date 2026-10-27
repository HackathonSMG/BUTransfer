-- ============================================================
-- Migration 006: Per-course evaluator decisions and the decision memory
-- ============================================================
-- Evaluator decisions become past_decisions (precedents) that the credit engine and the agent reuse.
-- Agreeing decisions from different evaluators are promoted to equivalencies, which then auto-apply.

CREATE SEQUENCE IF NOT EXISTS past_decision_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS equivalency_number_seq START 1000;

-- Where each precedent came from, and whether it is still used
ALTER TABLE past_decisions ADD COLUMN IF NOT EXISTS source     TEXT        NOT NULL DEFAULT 'sample';
ALTER TABLE past_decisions ADD COLUMN IF NOT EXISTS status     TEXT        NOT NULL DEFAULT 'active';
ALTER TABLE past_decisions ADD COLUMN IF NOT EXISTS decided_by UUID        REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE past_decisions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE equivalencies  ADD COLUMN IF NOT EXISTS source        TEXT   NOT NULL DEFAULT 'sample';
ALTER TABLE equivalencies  ADD COLUMN IF NOT EXISTS status        TEXT   NOT NULL DEFAULT 'active';
ALTER TABLE equivalencies  ADD COLUMN IF NOT EXISTS promoted_from TEXT[] NOT NULL DEFAULT '{}';

DO $$ BEGIN ALTER TABLE past_decisions ADD CONSTRAINT past_decisions_source_check CHECK (source IN ('sample', 'evaluator')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE past_decisions ADD CONSTRAINT past_decisions_status_check CHECK (status IN ('active', 'revoked')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE equivalencies  ADD CONSTRAINT equivalencies_source_check  CHECK (source IN ('sample', 'promoted')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE equivalencies  ADD CONSTRAINT equivalencies_status_check  CHECK (status IN ('active', 'revoked')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One decision per transcript course (re-deciding replaces it)
CREATE TABLE IF NOT EXISTS course_decisions (
  id                     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id         UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  transcript_course_id   UUID          NOT NULL UNIQUE REFERENCES transcript_courses(id) ON DELETE CASCADE,
  course_evaluation_id   UUID          REFERENCES course_evaluations(id) ON DELETE SET NULL,
  action                 TEXT          NOT NULL CHECK (action IN ('approve', 'change', 'reject')),
  outcome                TEXT          NOT NULL CHECK (outcome IN ('transfer', 'elective', 'no_credit')),
  bu_award               TEXT,
  reason                 TEXT,
  recommendation         TEXT,
  matched_recommendation BOOLEAN       NOT NULL DEFAULT false,
  past_decision_id       TEXT          REFERENCES past_decisions(decision_id) ON DELETE SET NULL,
  decided_by             UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- The agent's recommendation, kept next to the engine's so evaluators can compare
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS agent_outcome       TEXT;
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS agent_bu_course     TEXT;
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS agent_confidence    NUMERIC(3,2);
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS agent_rationale     TEXT;
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS agent_precedent_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS agent_missing       TEXT;
ALTER TABLE ai_evaluations     ADD COLUMN IF NOT EXISTS agent_status        TEXT;
ALTER TABLE ai_evaluations     ADD COLUMN IF NOT EXISTS agent_error         TEXT;

CREATE INDEX IF NOT EXISTS idx_course_decisions_app ON course_decisions(application_id);

ALTER TABLE course_decisions ENABLE ROW LEVEL SECURITY;
