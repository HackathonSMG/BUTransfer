-- ============================================================
-- Migration 010: Credit Evaluation Office final review
-- ============================================================
-- Before posting, the Credit Evaluation Office can return an evaluator's decision for another look. The review
-- reopens with the office's reason; the returned decision itself is kept in the audit trail.
-- Additive only and safe to re-run.

ALTER TABLE course_reviews ADD COLUMN IF NOT EXISTS returned_reason TEXT;
ALTER TABLE course_reviews ADD COLUMN IF NOT EXISTS returned_at     TIMESTAMPTZ;
