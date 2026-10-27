-- ============================================================
-- Migration 007: Agent enhancements — validation, feedback, AI transcript
-- ============================================================

-- Allow validation_failed status on applications. applications.status is the application_status enum
-- (001), so the value is added to the enum; a CHECK constraint naming it fails because the enum has no such value.
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'validation_failed';

-- Store Phase 1 validation result from the agent
ALTER TABLE ai_evaluations ADD COLUMN IF NOT EXISTS validation_status TEXT
  CHECK (validation_status IN ('passed', 'failed', 'skipped'));
ALTER TABLE ai_evaluations ADD COLUMN IF NOT EXISTS validation_result JSONB;

-- Track evaluator agreement / override on agent recommendations for confidence learning
CREATE TABLE IF NOT EXISTS agent_feedback (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_evaluation_id UUID          REFERENCES course_evaluations(id) ON DELETE CASCADE,
  application_id       UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  institution          TEXT          NOT NULL,
  course_code          TEXT          NOT NULL,
  agent_outcome        TEXT,
  agent_confidence     NUMERIC(3,2),
  evaluator_outcome    TEXT          NOT NULL,
  evaluator_bu_award   TEXT,
  matched              BOOLEAN       NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_course ON agent_feedback(institution, course_code);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_app    ON agent_feedback(application_id);

ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
