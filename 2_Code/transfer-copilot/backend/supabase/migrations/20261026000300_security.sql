-- =====================================================================
-- Security
--
-- The browser never talks to these tables directly: every request goes
-- through the Node.js API, which authenticates the Supabase Auth JWT and
-- enforces role-based access in the service layer. The API connects as the
-- database owner (direct Postgres connection), so RLS does not apply to it.
--
-- Row Level Security is enabled on every table with NO policies for the
-- `anon` and `authenticated` roles, so the public Data API (PostgREST) and
-- the publishable/anon key cannot read or write application data.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'institutions','departments','programs','courses','course_syllabi','worksheet_course_matches','transfer_rules',
    'program_requirements','seasons','profiles','students','evaluators','evaluator_daily_stats','applications',
    'transcripts','transcript_courses','course_evaluations','ai_recommendations','documents','evaluation_evidence',
    'evaluator_assignments','evaluation_decisions','information_requests','evaluation_history','notifications',
    'equivalencies','past_decisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- views run with the caller's privileges, so they are covered by the table rules above
alter view public.v_evaluator_workload set (security_invoker = true);
alter view public.v_evaluator_activity_daily set (security_invoker = true);
alter view public.v_application_summary set (security_invoker = true);
revoke all on public.v_evaluator_workload, public.v_evaluator_activity_daily, public.v_application_summary from anon, authenticated;

revoke execute on function public.next_application_reference() from anon, authenticated, public;
revoke execute on function public.next_equivalency_code() from anon, authenticated, public;
