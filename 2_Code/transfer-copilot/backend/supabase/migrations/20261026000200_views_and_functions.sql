-- =====================================================================
-- Views and functions used by the API's repository layer
-- =====================================================================

-- Current workload per evaluator: open cases they own + pending courses routed to them
create or replace view public.v_evaluator_workload as
select
  e.id as evaluator_id,
  e.staff_code,
  e.unit,
  coalesce(o.active_cases, 0)   as active_cases,
  coalesce(r.active_reviews, 0) as active_reviews,
  case when e.unit = 'credit_evaluation' then coalesce(o.active_cases, 0) else coalesce(r.active_reviews, 0) end as active_load,
  e.max_active_load,
  e.is_available,
  e.is_active
from public.evaluators e
left join (
  select a.evaluator_id, count(*) as active_cases
  from public.evaluator_assignments a
  join public.applications ap on ap.id = a.application_id
  where a.assignment_type = 'case_owner' and a.status in ('assigned', 'in_progress') and ap.status <> 'completed'
  group by a.evaluator_id
) o on o.evaluator_id = e.id
left join (
  select a.evaluator_id, count(*) as active_reviews
  from public.evaluator_assignments a
  join public.course_evaluations ce on ce.id = a.course_evaluation_id
  where a.assignment_type = 'department_review' and a.status in ('assigned', 'in_progress')
    and ce.state in ('pending', 'info_requested')
  group by a.evaluator_id
) r on r.evaluator_id = e.id;

-- Per-day decisions for each evaluator: historical (Synthetic Data) + live decisions
create or replace view public.v_evaluator_activity_daily as
select evaluator_id, day, sum(decisions)::int as decisions, sum(live)::int as live_decisions, sum(decisions - live)::int as historical_decisions
from (
  select evaluator_id, day, decisions, 0 as live from public.evaluator_daily_stats
  union all
  select d.evaluator_id, (d.created_at at time zone 'UTC')::date as day, count(*)::int, count(*)::int
  from public.evaluation_decisions d
  where d.action in ('accept', 'reject', 'override')
  group by d.evaluator_id, (d.created_at at time zone 'UTC')::date
) x
group by evaluator_id, day;

-- One row per application with the numbers every list needs
create or replace view public.v_application_summary as
select
  ap.id as application_id,
  ap.reference,
  ap.status,
  ap.student_id,
  ap.submitted_at,
  ap.completed_at,
  count(ce.id)                                                                as courses,
  count(ce.id) filter (where ce.state in ('pending', 'info_requested'))       as pending_courses,
  count(ce.id) filter (where ce.state = 'info_requested')                     as info_requested_courses,
  count(ce.id) filter (where ce.student_status = 'Confirmed')                 as accepted_courses,
  count(ce.id) filter (where ce.student_status = 'Not transferable')          as rejected_courses,
  coalesce(sum(ce.requested_credits), 0)                                      as requested_credits,
  coalesce(sum(ce.awarded_credits) filter (where ce.student_status = 'Confirmed'), 0) as accepted_credits,
  coalesce(sum(ce.requested_credits) filter (where ce.state in ('pending', 'info_requested')), 0) as pending_credits,
  round(avg(r.match_pct))::int                                                as avg_match_pct
from public.applications ap
left join public.course_evaluations ce on ce.application_id = ap.id
left join public.ai_recommendations r on r.id = ce.current_recommendation_id
group by ap.id;

-- Next sequence-style reference for new applications (TCR-<yy>-<nnn>)
create or replace function public.next_application_reference() returns text
language sql volatile as $$
  select 'TCR-' || to_char(now(), 'YY') || '-' || lpad((coalesce(max(nullif(regexp_replace(reference, '^TCR-\d+-', ''), '')::int), 0) + 1)::text, 3, '0')
  from public.applications
$$;

-- Next equivalency code (EQ-nnn)
create or replace function public.next_equivalency_code() returns text
language sql volatile as $$
  select 'EQ-' || lpad((coalesce(max(substring(code from 4)::int), 0) + 1)::text, 3, '0') from public.equivalencies
$$;
