-- Drops every object created by the migrations (used by `npm run db:reset`). Auth users are not touched.
drop view if exists public.v_equivalency_kb, public.v_application_summary, public.v_evaluator_activity_daily, public.v_evaluator_workload cascade;
drop table if exists public.equivalency_usage, public.equivalency_evidence, public.equivalency_versions, public.equivalency_aliases,
  public.evaluation_policies, public.ai_confidence_scores, public.ai_extraction_results, public.transcript_processing_jobs,
  public.transcript_documents, public.notifications, public.evaluation_history, public.information_requests, public.evaluation_decisions,
  public.evaluator_assignments, public.evaluation_evidence, public.documents, public.ai_recommendations,
  public.course_evaluations, public.transcript_courses, public.transcripts, public.applications,
  public.evaluator_daily_stats, public.evaluators, public.students, public.profiles, public.seasons,
  public.program_requirements, public.transfer_rules, public.worksheet_course_matches, public.course_syllabi,
  public.equivalencies, public.past_decisions, public.courses, public.programs, public.departments, public.institutions,
  public.app_migrations cascade;
drop function if exists public.next_application_reference(), public.next_equivalency_code(), public.set_updated_at() cascade;
