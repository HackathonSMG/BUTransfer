-- ============================================================
-- Migration 009: The complete transfer credit lifecycle (Problem 1, steps 3-7)
-- ============================================================
-- 1. Credit Evaluation Office role and application states for final posting
-- 2. Transcript courses: matched catalog code, repeat attempts, the syllabus received for the course
-- 3. Course-level information requests (syllabus requests) and documents linked to a course
-- 4. The evaluator's decision model (equivalent / elective / different BU course / no credit) and units
-- 5. Posted transfer credit: grade T, units, never in the BU GPA, no Hub units
-- 6. Duplicate applications and the one-year deadline exception
-- 7. Assignment queue, assignment history and evaluator availability
-- 8. Equivalency conflict resolutions
-- Additive only. migrate.js re-runs every file, so every statement is idempotent. New enum values are not
-- used in this file (Postgres does not allow that in the transaction that adds them).

-- ---------- 1. Roles and application states ----------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'credit_office';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'ready_for_posting';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'credit_posted';

-- ---------- 2. Transcript courses ----------
-- The catalog spelling of the course code when the transcript writes it differently (CS1800 -> CS 1800)
ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS catalog_code         TEXT;
-- A course passed more than once: the attempt that earns the credit (this row is the repeat)
ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS repeat_of            UUID REFERENCES transcript_courses(id) ON DELETE SET NULL;
ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS syllabus_document_id UUID REFERENCES application_documents(id) ON DELETE SET NULL;
ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS syllabus_text        TEXT;
ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS syllabus_received_at TIMESTAMPTZ;

ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS missing_information TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS combined_with       TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE course_evaluations ADD COLUMN IF NOT EXISTS syllabus_compared   BOOLEAN NOT NULL DEFAULT false;

-- ---------- 3. Course-level information requests ----------
ALTER TABLE information_requests ADD COLUMN IF NOT EXISTS transcript_course_id UUID REFERENCES transcript_courses(id) ON DELETE CASCADE;
ALTER TABLE information_requests ADD COLUMN IF NOT EXISTS kind                 TEXT NOT NULL DEFAULT 'information';
ALTER TABLE information_requests ADD COLUMN IF NOT EXISTS document_id          UUID REFERENCES application_documents(id) ON DELETE SET NULL;
ALTER TABLE information_requests ADD COLUMN IF NOT EXISTS responded_at         TIMESTAMPTZ;
DO $$ BEGIN ALTER TABLE information_requests ADD CONSTRAINT information_requests_kind_check CHECK (kind IN ('information', 'syllabus')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_info_requests_course ON information_requests(transcript_course_id);

ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS transcript_course_id   UUID REFERENCES transcript_courses(id) ON DELETE SET NULL;
ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS information_request_id UUID REFERENCES information_requests(id) ON DELETE SET NULL;

-- ---------- 4. Decision model ----------
-- decision_type: equivalent_course | different_course | elective | no_credit | established_equivalency | policy_rule
ALTER TABLE course_decisions ADD COLUMN IF NOT EXISTS decision_type   TEXT;
ALTER TABLE course_decisions ADD COLUMN IF NOT EXISTS bu_units        NUMERIC(5,2);
ALTER TABLE course_decisions ADD COLUMN IF NOT EXISTS decided_via     TEXT NOT NULL DEFAULT 'evaluator';
ALTER TABLE course_decisions ADD COLUMN IF NOT EXISTS conflict_action TEXT;
DO $$ BEGIN ALTER TABLE course_decisions ADD CONSTRAINT course_decisions_decided_via_check CHECK (decided_via IN ('evaluator', 'established_equivalency', 'policy_rule')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_decisions ADD CONSTRAINT course_decisions_units_check CHECK (bu_units IS NULL OR bu_units >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE course_decisions ADD CONSTRAINT course_decisions_conflict_action_check CHECK (conflict_action IS NULL OR conflict_action IN ('use_established', 'override')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE course_decisions SET decision_type = CASE WHEN outcome = 'no_credit' THEN 'no_credit' WHEN outcome = 'elective' THEN 'elective'
                                                WHEN action = 'change' THEN 'different_course' ELSE 'equivalent_course' END
WHERE decision_type IS NULL;

-- ---------- 5. Posted transfer credit ----------
-- One row per transcript course once the Credit Evaluation Office posts it. The policy columns are enforced
-- here as well as in the service: external grades never count toward the BU GPA and transfer courses earn no
-- BU Hub units.
CREATE TABLE IF NOT EXISTS credit_postings (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id        UUID          NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  transcript_course_id  UUID          NOT NULL UNIQUE REFERENCES transcript_courses(id) ON DELETE CASCADE,
  course_decision_id    UUID          REFERENCES course_decisions(id) ON DELETE SET NULL,
  outcome               TEXT          NOT NULL CHECK (outcome IN ('transfer', 'elective', 'no_credit')),
  bu_course             TEXT,
  units                 NUMERIC(5,2)  NOT NULL CHECK (units >= 0),
  transfer_grade        TEXT,
  source_grade          TEXT,
  counts_in_gpa         BOOLEAN       NOT NULL DEFAULT false CHECK (counts_in_gpa = false),
  hub_units             NUMERIC(4,2)  NOT NULL DEFAULT 0 CHECK (hub_units = 0),
  posted_by             UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK ((outcome = 'no_credit' AND units = 0 AND transfer_grade IS NULL) OR (outcome <> 'no_credit' AND transfer_grade IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_credit_postings_app ON credit_postings(application_id);

-- ---------- 6. Duplicates and the deadline ----------
ALTER TABLE applications ADD COLUMN IF NOT EXISTS duplicate_status      TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS duplicate_reason      TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deadline_exception    TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deadline_exception_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS posted_at             TIMESTAMPTZ;
DO $$ BEGIN ALTER TABLE applications ADD CONSTRAINT applications_duplicate_status_check CHECK (duplicate_status IS NULL OR duplicate_status IN ('suspected', 'not_duplicate', 'confirmed')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_applications_email_lower ON applications(LOWER(student_email));

-- ---------- 7. Assignment ----------
-- queue: 'evaluator' (a department evaluator holds it) or 'credit_office' (no suitable evaluator; the Credit
-- Evaluation Office assigns it). 'withdrawn' reviews belong to an application closed as a duplicate.
ALTER TABLE course_reviews ADD COLUMN IF NOT EXISTS queue              TEXT  NOT NULL DEFAULT 'evaluator';
ALTER TABLE course_reviews ADD COLUMN IF NOT EXISTS assignment_context JSONB NOT NULL DEFAULT '[]';
DO $$ BEGIN ALTER TABLE course_reviews ADD CONSTRAINT course_reviews_queue_check CHECK (queue IN ('evaluator', 'credit_office')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE course_reviews DROP CONSTRAINT IF EXISTS course_reviews_status_check;
ALTER TABLE course_reviews ADD CONSTRAINT course_reviews_status_check
  CHECK (status IN ('queued', 'new', 'in_progress', 'info_requested', 'approved', 'rejected', 'withdrawn'));
UPDATE course_reviews SET queue = 'credit_office' WHERE evaluator_id IS NULL AND queue = 'evaluator' AND status NOT IN ('approved', 'rejected');

-- Every assignment a review has had; the open row (ended_at IS NULL) is the current one
CREATE TABLE IF NOT EXISTS review_assignments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id     UUID        NOT NULL REFERENCES course_reviews(id) ON DELETE CASCADE,
  evaluator_id  UUID        REFERENCES evaluators(id) ON DELETE SET NULL,
  reason        TEXT,
  assigned_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_assignments_review ON review_assignments(review_id);
INSERT INTO review_assignments (review_id, evaluator_id, reason, assigned_at)
SELECT r.id, r.evaluator_id, r.assignment_reason, COALESCE(r.assigned_at, r.created_at) FROM course_reviews r
WHERE NOT EXISTS (SELECT 1 FROM review_assignments x WHERE x.review_id = r.id);

-- Active / Inactive is evaluators.is_active; Unavailable is a temporary absence (leave, sabbatical)
ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS availability      TEXT NOT NULL DEFAULT 'available';
ALTER TABLE evaluators ADD COLUMN IF NOT EXISTS unavailable_until DATE;
DO $$ BEGIN ALTER TABLE evaluators ADD CONSTRAINT evaluators_availability_check CHECK (availability IN ('available', 'unavailable')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 8. Conflict resolutions ----------
CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution  TEXT        NOT NULL,
  course_code  TEXT        NOT NULL,
  action       TEXT        NOT NULL CHECK (action IN ('use_established', 'override', 'additional_review', 'resolved')),
  bu_course    TEXT,
  note         TEXT,
  review_id    UUID        REFERENCES course_reviews(id) ON DELETE SET NULL,
  resolved_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_course ON conflict_resolutions(institution, course_code);

-- Backend-only tables, like the other credit tables (005, 008)
ALTER TABLE credit_postings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_resolutions ENABLE ROW LEVEL SECURITY;
