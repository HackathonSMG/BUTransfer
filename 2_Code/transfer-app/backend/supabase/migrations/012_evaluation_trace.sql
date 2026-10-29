-- Evaluation pipeline trace: what each automated stage did for one evaluation (transcripts read, quality check,
-- course matching, precedent search, established outcomes, routing), with counts and timings, so the Credit
-- Evaluation Office can see the work done before a department evaluator opened the application. Written once at
-- the end of an evaluation run; NULL for evaluations run before this migration. Additive and idempotent.

ALTER TABLE ai_evaluations ADD COLUMN IF NOT EXISTS pipeline_trace JSONB;
