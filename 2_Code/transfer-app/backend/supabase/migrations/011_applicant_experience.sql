-- Applicant-first intake and applicant email notifications.
-- Applicants apply without an account and track with application number + email. Their notifications reuse the
-- notifications table; the email columns turn it into a retryable outbox (email_status NULL = in-app only).
-- Status history is not duplicated here: every status change is already an audit_logs 'status_changed' row.

ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_comments TEXT;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_status          TEXT;   -- pending, sending, retry, sent, logged, failed, suppressed
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_attempts        INT NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_error           TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_next_attempt_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS emailed_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notif_email_outbox ON notifications(email_next_attempt_at)
  WHERE email_status IN ('pending', 'retry', 'sending');
CREATE INDEX IF NOT EXISTS idx_notif_application   ON notifications(application_id, type);
CREATE INDEX IF NOT EXISTS idx_applications_email_lower ON applications(LOWER(student_email));
CREATE INDEX IF NOT EXISTS idx_audit_app_action ON audit_logs(application_id, action, created_at);
