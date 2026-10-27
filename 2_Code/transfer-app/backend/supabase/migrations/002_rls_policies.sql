-- ============================================================
-- Migration 002: Row Level Security (RLS) Policies
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_evaluator_or_admin() RETURNS BOOLEAN AS $$
  SELECT role IN ('evaluator', 'admin') FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluators            ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_criteria  ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_evaluations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE information_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS profiles_select_own   ON profiles;
CREATE POLICY profiles_select_own   ON profiles FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS profiles_select_staff ON profiles;
CREATE POLICY profiles_select_staff ON profiles FOR SELECT USING (is_evaluator_or_admin());
DROP POLICY IF EXISTS profiles_update_own   ON profiles;
CREATE POLICY profiles_update_own   ON profiles FOR UPDATE USING (id = auth.uid());
DROP POLICY IF EXISTS profiles_admin_all    ON profiles;
CREATE POLICY profiles_admin_all    ON profiles FOR ALL    USING (get_my_role() = 'admin');

-- evaluators
DROP POLICY IF EXISTS evaluators_select ON evaluators;
CREATE POLICY evaluators_select ON evaluators FOR SELECT USING (is_evaluator_or_admin());
DROP POLICY IF EXISTS evaluators_admin  ON evaluators;
CREATE POLICY evaluators_admin  ON evaluators FOR ALL    USING (get_my_role() = 'admin');

-- eligibility_criteria
DROP POLICY IF EXISTS criteria_select_public ON eligibility_criteria;
CREATE POLICY criteria_select_public ON eligibility_criteria FOR SELECT USING (true);
DROP POLICY IF EXISTS criteria_admin_write   ON eligibility_criteria;
CREATE POLICY criteria_admin_write   ON eligibility_criteria FOR ALL    USING (get_my_role() = 'admin');

-- applications
DROP POLICY IF EXISTS applications_select_staff   ON applications;
CREATE POLICY applications_select_staff   ON applications FOR SELECT USING (is_evaluator_or_admin());
DROP POLICY IF EXISTS applications_select_student ON applications;
CREATE POLICY applications_select_student ON applications FOR SELECT USING (student_profile_id = auth.uid());
DROP POLICY IF EXISTS applications_insert_student ON applications;
CREATE POLICY applications_insert_student ON applications FOR INSERT WITH CHECK (student_profile_id = auth.uid() OR student_profile_id IS NULL);
DROP POLICY IF EXISTS applications_insert_evaluator ON applications;
CREATE POLICY applications_insert_evaluator ON applications FOR INSERT WITH CHECK (is_evaluator_or_admin());
DROP POLICY IF EXISTS applications_update_staff   ON applications;
CREATE POLICY applications_update_staff   ON applications FOR UPDATE USING (is_evaluator_or_admin());
DROP POLICY IF EXISTS applications_update_student ON applications;
CREATE POLICY applications_update_student ON applications FOR UPDATE USING (student_profile_id = auth.uid() AND status = 'draft');

-- application_documents
DROP POLICY IF EXISTS docs_select_staff   ON application_documents;
CREATE POLICY docs_select_staff   ON application_documents FOR SELECT USING (is_evaluator_or_admin());
DROP POLICY IF EXISTS docs_select_student ON application_documents;
CREATE POLICY docs_select_student ON application_documents FOR SELECT USING (EXISTS (SELECT 1 FROM applications a WHERE a.id = application_documents.application_id AND a.student_profile_id = auth.uid()));
DROP POLICY IF EXISTS docs_insert         ON application_documents;
CREATE POLICY docs_insert         ON application_documents FOR INSERT WITH CHECK (is_evaluator_or_admin() OR EXISTS (SELECT 1 FROM applications a WHERE a.id = application_documents.application_id AND a.student_profile_id = auth.uid()));
DROP POLICY IF EXISTS docs_delete_admin   ON application_documents;
CREATE POLICY docs_delete_admin   ON application_documents FOR DELETE USING (get_my_role() = 'admin');

-- ai_evaluations
DROP POLICY IF EXISTS ai_eval_staff ON ai_evaluations;
CREATE POLICY ai_eval_staff ON ai_evaluations FOR ALL USING (is_evaluator_or_admin());

-- information_requests
DROP POLICY IF EXISTS info_req_select_staff   ON information_requests;
CREATE POLICY info_req_select_staff   ON information_requests FOR SELECT USING (is_evaluator_or_admin());
DROP POLICY IF EXISTS info_req_select_student ON information_requests;
CREATE POLICY info_req_select_student ON information_requests FOR SELECT USING (EXISTS (SELECT 1 FROM applications a WHERE a.id = information_requests.application_id AND a.student_profile_id = auth.uid()));
DROP POLICY IF EXISTS info_req_insert_staff   ON information_requests;
CREATE POLICY info_req_insert_staff   ON information_requests FOR INSERT WITH CHECK (is_evaluator_or_admin());
DROP POLICY IF EXISTS info_req_update         ON information_requests;
CREATE POLICY info_req_update         ON information_requests FOR UPDATE USING (is_evaluator_or_admin() OR EXISTS (SELECT 1 FROM applications a WHERE a.id = information_requests.application_id AND a.student_profile_id = auth.uid()));

-- audit_logs
DROP POLICY IF EXISTS audit_admin_select     ON audit_logs;
CREATE POLICY audit_admin_select     ON audit_logs FOR SELECT USING (get_my_role() = 'admin');
DROP POLICY IF EXISTS audit_evaluator_select ON audit_logs;
CREATE POLICY audit_evaluator_select ON audit_logs FOR SELECT USING (get_my_role() = 'evaluator' AND EXISTS (SELECT 1 FROM applications a WHERE a.id = audit_logs.application_id AND a.assigned_evaluator_id = auth.uid()));

-- notifications
DROP POLICY IF EXISTS notifications_own   ON notifications;
CREATE POLICY notifications_own   ON notifications FOR ALL    USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS notifications_admin ON notifications;
CREATE POLICY notifications_admin ON notifications FOR SELECT USING (get_my_role() = 'admin');
