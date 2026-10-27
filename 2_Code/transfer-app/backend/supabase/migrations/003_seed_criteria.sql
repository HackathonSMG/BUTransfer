-- ============================================================
-- Migration 003: Seed Default Eligibility Criteria
-- ============================================================

DELETE FROM eligibility_criteria WHERE criterion_name IN (
  'Minimum GPA','Official Transcripts Submitted','Minimum Credit Hours','Good Academic Standing',
  'Transfer from Accredited Institution','No Outstanding Disciplinary Actions','Program Prerequisites Met','Application Deadline Met'
);

INSERT INTO eligibility_criteria (criterion_name, description, rule_type, rule_config, is_required, display_order, is_active, version) VALUES
  ('Minimum GPA','The applicant must have maintained a minimum cumulative GPA of 2.5 on a 4.0 scale at their previous institution.','gpa','{"min_gpa": 2.5}'::jsonb,true,1,true,1),
  ('Official Transcripts Submitted','Official transcripts from all previously attended post-secondary institutions must be submitted directly from the institution or through a verified credential service.','document','{"document_type": "transcript", "official_required": true}'::jsonb,true,2,true,1),
  ('Minimum Credit Hours','The applicant must have completed a minimum of 30 transferable credit hours at the post-secondary level.','credits','{"min_credits": 30}'::jsonb,true,3,true,1),
  ('Good Academic Standing','The applicant must be in good academic standing at their current or most recent institution at the time of application.','standing','{}'::jsonb,true,4,true,1),
  ('Transfer from Accredited Institution','Credits will only be accepted from institutions that are regionally or nationally accredited by a body recognized by the U.S. Department of Education.','accreditation','{"recognized_bodies": ["NECHE","HLC","SACSCOC","MSCHE","WSCUC","NWCCU"]}'::jsonb,true,5,true,1),
  ('No Outstanding Disciplinary Actions','The applicant must have no pending or active disciplinary actions, academic integrity violations, or conduct violations.','disciplinary','{"disclosure_required": true}'::jsonb,true,6,true,1),
  ('Program Prerequisites Met','The applicant must have completed or be enrolled in the prerequisite courses required for the target BU program.','prerequisites','{"verification_required": true, "department_may_override": true}'::jsonb,false,7,true,1),
  ('Application Deadline Met','The completed application must be submitted at least 3 months (90 days) before the expected start term.','deadline','{"months_before_start": 3, "late_consideration": true}'::jsonb,true,8,true,1);
