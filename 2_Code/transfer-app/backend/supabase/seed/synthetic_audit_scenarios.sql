-- ============================================================
-- Synthetic audit scenarios (TRANSFER_CREDIT_RULE_AND_EDGE_CASE_REVIEW.md, sections D and J)
-- ============================================================
-- Adds ONLY the records needed for rules and edge cases that the sponsor data and the sample students cannot
-- exercise. Every row is data_source = 'synthetic'; sponsor data is not touched. Safe to re-run (nothing is
-- inserted twice). Students, grades and the past decisions below are fictional.
-- Run after migrations 001-009.
--
-- After running: open each application as an administrator or Credit Evaluation Office user and click
-- "Run evaluation", so the real pipeline (credit engine, established equivalencies, evaluator assignment)
-- processes it.
--   APP-2026-9101  Pass grade on an established equivalency; A+ grade                     (AUD-01, AUD-02)
--   APP-2026-9102  Repeated course; code without a space (CS1800); missing credits         (AUD-03, AUD-04, AUD-05)
--   APP-2026-9103  Course with no catalog entry and no subject specialist                   (AUD-06)
--   APP-2026-9104  Second application from the same student as 9101                        (AUD-07)
--   APP-2026-9105  Conflicting earlier decisions; BU start term long past (deadline)       (AUD-08, AUD-09)
--   APP-2026-9106  F, "fail", lowercase/padded grade, D and W                               (LC-18, grade normalisation)
--   APP-2026-9107  Courses from four institutions (multiple transcripts), one quarter-system (LC-23, LC-24)
--   APP-2026-9108  Combined lecture + lab course awarded as two BU courses; "maybe" courses (LC-32, AUD-22)
--   APP-2026-9109  Started at BU just over a year ago (one-year deadline)                   (LC-26)
--   APP-2026-9110  Started at BU within the last year                                       (LC-26)
--   APP-2026-9111  "Pass", missing, unreadable and "P/F" grades                             (LC-17, grade normalisation)

-- Past decisions for the scenarios (data_source = 'synthetic')
--   PD-S001 / PD-S002  the same NYU course awarded two different BU courses (conflict)
--   PD-S003            a combined lecture + lab course awarded as two BU courses
INSERT INTO past_decisions (decision_id, institution, course_code, proposed_bu, decision, bu_awarded, reason, credit_system, decided_on, evaluator, source, status, data_source)
VALUES
  ('PD-S001', 'New York University', 'BIOL-UA 21', 'CAS BI 203', 'BU equivalent', 'CAS BI 203',
   'Covers cell structure, membranes and signalling; matches BI 203.', 'Semester', '2026-03-10', 'Department evaluator (Biology)', 'sample', 'active', 'synthetic'),
  ('PD-S002', 'New York University', 'BIOL-UA 21', 'CAS BI 203', 'BU equivalent', 'CAS BI 206',
   'Molecular genetics content dominates; closer to BI 206.', 'Semester', '2026-05-22', 'Department evaluator (Biology)', 'sample', 'active', 'synthetic'),
  ('PD-S003', 'Riverside Community College', 'CHM 120', 'CAS CH 101 + CAS CH 102', 'BU equivalent', 'CAS CH 101 + CAS CH 102',
   'Accelerated two-semester general chemistry sequence with weekly lab; covers CH 101 and CH 102 together.', 'Semester', '2026-02-14', 'Department evaluator (Chemistry)', 'sample', 'active', 'synthetic')
ON CONFLICT (decision_id) DO NOTHING;

-- Applications and their transcript courses (courses are added only when the application is new)
WITH apps (reference_number, student_name, student_email, institution, program, start_term, gpa, credits) AS (
  VALUES
    ('APP-2026-9101', 'Elena Brooks',  'elena.brooks@students.example.org',  'Riverside Community College', 'Computer Science', 'Fall 2026',   3.6, 8),
    ('APP-2026-9102', 'Marcus Reed',   'marcus.reed@students.example.org',   'Northeastern University',     'Computer Science', 'Fall 2026',   3.3, 13),
    ('APP-2026-9103', 'Hannah Cole',   'hannah.cole@students.example.org',   'Riverside Community College', 'Computer Science', 'Fall 2026',   3.4, 8),
    ('APP-2026-9104', 'Elena Brooks',  'elena.brooks@students.example.org',  'New York University',         'Computer Science', 'Fall 2026',   3.6, 4),
    ('APP-2026-9105', 'Victor Lane',   'victor.lane@students.example.org',   'New York University',         'Biology',          'Fall 2024',   3.5, 8),
    ('APP-2026-9106', 'Nina Patel',    'nina.patel@students.example.org',    'Riverside Community College', 'Economics',        'Fall 2026',   2.9, 16),
    ('APP-2026-9107', 'Owen Price',    'owen.price@students.example.org',    'Riverside Community College', 'Computer Science', 'Fall 2026',   3.5, 16),
    ('APP-2026-9108', 'Grace Kim',     'grace.kim@students.example.org',     'Riverside Community College', 'Chemistry',        'Fall 2026',   3.7, 13),
    ('APP-2026-9109', 'Leo Martin',    'leo.martin@students.example.org',    'New York University',         'Computer Science', 'Fall 2025',   3.4, 4),
    ('APP-2026-9110', 'Ivy Chen',      'ivy.chen@students.example.org',      'New York University',         'Computer Science', 'Spring 2026', 3.6, 4),
    ('APP-2026-9111', 'Sam Rivera',    'sam.rivera@students.example.org',    'New York University',         'Mathematics',      'Fall 2026',   3.2, 16)
),
inserted AS (
  INSERT INTO applications (reference_number, source, status, student_name, student_email, transfer_from_institution, transfer_to_program,
                            transfer_to_department, expected_start_term, academic_history, additional_info, submitted_at, data_source)
  SELECT a.reference_number, 'website', 'submitted', a.student_name, a.student_email, a.institution, a.program,
         'College of Arts & Sciences', a.start_term,
         jsonb_build_object('gpa', a.gpa, 'credits_completed', a.credits, 'academic_standing', 'good_standing'),
         jsonb_build_object('audit_scenario', a.reference_number), NOW(), 'synthetic'
  FROM apps a
  WHERE NOT EXISTS (SELECT 1 FROM applications x WHERE x.reference_number = a.reference_number)
  RETURNING id, reference_number
)
INSERT INTO transcript_courses (application_id, position, institution, course_code, title, term, credit_system, source_credits, grade)
SELECT i.id, c.position, c.institution, c.course_code, c.title, c.term, c.credit_system, c.credits, c.grade
FROM inserted i
JOIN (VALUES
  -- 9101: Pass grade on a course with an established equivalency; A+ on a course with an established equivalency
  ('APP-2026-9101', 1, 'Riverside Community College', 'CSC 110',     'Programming Fundamentals with Python',              'Fall 2025',   'Semester', 4::numeric, 'P'),
  ('APP-2026-9101', 2, 'Northeastern University',     'CS 2000',     'Introduction to Program Design and Implementation', 'Spring 2026', 'Semester', 5::numeric, 'A+'),
  -- 9102: the same course passed twice; the same course code written without a space; credits missing
  ('APP-2026-9102', 1, 'Northeastern University',     'CS 2000',     'Introduction to Program Design and Implementation', 'Fall 2024',   'Semester', 5::numeric, 'B'),
  ('APP-2026-9102', 2, 'Northeastern University',     'CS 2000',     'Introduction to Program Design and Implementation', 'Fall 2025',   'Semester', 5::numeric, 'A'),
  ('APP-2026-9102', 3, 'Northeastern University',     'CS1800',      'Discrete Structures',                               'Spring 2025', 'Semester', 4::numeric, 'A-'),
  ('APP-2026-9102', 4, 'Northeastern University',     'CS 3000',     'Algorithms and Data',                               'Spring 2026', 'Semester', NULL,       'B+'),
  -- 9103: a course no catalog lists, in a subject no evaluator specialises in
  ('APP-2026-9103', 1, 'Riverside Community College', 'ART 105',     'Ceramics I',                                        'Fall 2025',   'Semester', 3::numeric, 'A'),
  ('APP-2026-9103', 2, 'Riverside Community College', 'CSC 110',     'Programming Fundamentals with Python',              'Spring 2026', 'Semester', 4::numeric, 'B+'),
  -- 9104: second application by the same student (same email as 9101)
  ('APP-2026-9104', 1, 'New York University',         'ECON-UA 1',   'Introduction to Macroeconomics',                    'Fall 2025',   'Semester', 4::numeric, 'A-'),
  -- 9105: course whose earlier decisions disagree (PD-S001 vs PD-S002); BU start term long past
  ('APP-2026-9105', 1, 'New York University',         'BIOL-UA 21',  'Molecular and Cell Biology I',                      'Spring 2024', 'Semester', 4::numeric, 'B+'),
  ('APP-2026-9105', 2, 'New York University',         'BIOL-UA 11',  'Principles of Biology I',                           'Fall 2023',   'Semester', 4::numeric, 'A'),
  -- 9106: failing and below-minimum grades written several ways, and a withdrawal
  ('APP-2026-9106', 1, 'Riverside Community College', 'MAT 151',     'Calculus I',                                        'Fall 2024',   'Semester', 4::numeric, 'F'),
  ('APP-2026-9106', 2, 'Riverside Community College', 'MAT 152',     'Calculus II',                                       'Spring 2025', 'Semester', 4::numeric, 'fail'),
  ('APP-2026-9106', 3, 'Riverside Community College', 'ECO 201',     'Principles of Microeconomics',                      'Fall 2025',   'Semester', 3::numeric, ' b+ '),
  ('APP-2026-9106', 4, 'Riverside Community College', 'ECO 202',     'Principles of Macroeconomics',                      'Spring 2026', 'Semester', 3::numeric, 'D'),
  ('APP-2026-9106', 5, 'Riverside Community College', 'PSY 101',     'Introduction to Psychology',                        'Spring 2026', 'Semester', 3::numeric, 'W'),
  -- 9107: four institutions on one application, one of them on the quarter system
  ('APP-2026-9107', 1, 'Riverside Community College', 'CSC 110',     'Programming Fundamentals with Python',              'Fall 2024',   'Semester', 4::numeric, 'A'),
  ('APP-2026-9107', 2, 'Northeastern University',     'CS 1800',     'Discrete Structures',                               'Spring 2025', 'Semester', 4::numeric, 'B+'),
  ('APP-2026-9107', 3, 'New York University',         'PSYCH-UA 1',  'Introduction to Psychology',                        'Fall 2025',   'Semester', 4::numeric, 'A-'),
  ('APP-2026-9107', 4, 'Pacific Coast State University', 'MATH 19A', 'Calculus for Science I',                            'Winter 2026', 'Quarter',  5::numeric, 'B'),
  -- 9108: a combined lecture + lab course awarded as two BU courses (PD-S003); two "maybe" courses
  ('APP-2026-9108', 1, 'Riverside Community College', 'CHM 120',     'General Chemistry I and II with Lab (accelerated)', 'Fall 2025',   'Semester', 8::numeric, 'A'),
  ('APP-2026-9108', 2, 'Riverside Community College', 'CSC 220',     'Data Structures in Java',                           'Spring 2026', 'Semester', 4::numeric, 'A-'),
  ('APP-2026-9108', 3, 'Riverside Community College', 'KIN 105',     'Fitness and Wellness',                              'Spring 2026', 'Semester', 1::numeric, 'B'),
  -- 9109 / 9110: the one-year deadline, just passed and still open
  ('APP-2026-9109', 1, 'New York University',         'CSCI-UA 101', 'Introduction to Computer Science',                  'Spring 2025', 'Semester', 4::numeric, 'A'),
  ('APP-2026-9110', 1, 'New York University',         'CSCI-UA 102', 'Data Structures',                                   'Fall 2025',   'Semester', 4::numeric, 'B'),
  -- 9111: grades an evaluator must confirm or ask about
  ('APP-2026-9111', 1, 'New York University',         'MATH-UA 121', 'Calculus I',                                        'Fall 2024',   'Semester', 4::numeric, 'Pass'),
  ('APP-2026-9111', 2, 'New York University',         'MATH-UA 122', 'Calculus II',                                       'Spring 2025', 'Semester', 4::numeric, NULL),
  ('APP-2026-9111', 3, 'New York University',         'MATH-UA 123', 'Calculus III',                                      'Fall 2025',   'Semester', 4::numeric, 'Z'),
  ('APP-2026-9111', 4, 'New York University',         'MATH-UA 140', 'Linear Algebra',                                    'Spring 2026', 'Semester', 4::numeric, 'P/F')
) AS c (reference_number, position, institution, course_code, title, term, credit_system, credits, grade)
  ON c.reference_number = i.reference_number;

-- Check: expect 11 synthetic audit applications and 3 synthetic past decisions
SELECT (SELECT COUNT(*) FROM applications WHERE additional_info ? 'audit_scenario') AS audit_applications,
       (SELECT COUNT(*) FROM past_decisions WHERE decision_id IN ('PD-S001', 'PD-S002', 'PD-S003')) AS audit_past_decisions;
