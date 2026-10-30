-- Course equivalency management: evaluators propose equivalencies, the Credit Evaluation Office and
-- administrators approve, reject, add, revoke and restore them, and administrators import them in bulk.
-- equivalencies keeps one row per source course (UNIQUE (institution, course_code)) with status active | revoked;
-- proposals wait in their own table, so a proposal for a course that already has an equivalency never adds a
-- second row. Additive and idempotent: existing rows keep their meaning.

-- New origins: added directly by the office (manual), recorded as a standard from Conflicts (standard), bulk import (imported)
ALTER TABLE equivalencies DROP CONSTRAINT IF EXISTS equivalencies_source_check;
ALTER TABLE equivalencies ADD CONSTRAINT equivalencies_source_check
  CHECK (source IN ('sample', 'promoted', 'manual', 'standard', 'imported'));

ALTER TABLE equivalencies ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE equivalencies ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE equivalencies ADD COLUMN IF NOT EXISTS note        TEXT;

CREATE TABLE IF NOT EXISTS equivalency_proposals (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution     TEXT         NOT NULL,
  course_code     TEXT         NOT NULL,
  title           TEXT,
  outcome         TEXT         NOT NULL CHECK (outcome IN ('BU equivalent', 'Elective credit', 'No credit')),
  bu_course       TEXT,
  note            TEXT,
  status          TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  source          TEXT         NOT NULL DEFAULT 'evaluator' CHECK (source IN ('evaluator', 'decision')),
  proposed_by     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  proposed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by     UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  review_id       UUID,
  equivalency_id  TEXT         REFERENCES equivalencies(eq_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS equivalency_proposals_status_idx ON equivalency_proposals (status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS equivalency_proposals_course_idx ON equivalency_proposals (institution, course_code);
CREATE INDEX IF NOT EXISTS equivalency_proposals_proposer_idx ON equivalency_proposals (proposed_by);

-- The API connects with the service role; RLS keeps the table closed to direct client access like the other memory tables
ALTER TABLE equivalency_proposals ENABLE ROW LEVEL SECURITY;
