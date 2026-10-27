-- =====================================================================
-- Transcript ingestion, AI extraction and the institutional equivalency
-- knowledge base.
--
--   Transcript source (portal / email / manual / integration)
--     → transcript_documents (original file in Supabase Storage)
--     → transcript_processing_jobs (stage-by-stage, visible to users)
--     → ai_extraction_results + ai_confidence_scores (per field)
--     → transcript_courses (extracted, correctable)
--     → knowledge-base lookup (equivalencies, aliases, versions)
--     → course_evaluations (path: known / AI recommended / manual review)
--     → evaluator decision → equivalency_versions / evidence / usage
--
-- "Every transcript makes the next transcript faster."
-- =====================================================================

-- ---------------------------------------------------------------------
-- reference data discovered from transcripts
-- ---------------------------------------------------------------------
alter table public.institutions drop constraint if exists institutions_data_source_check;
alter table public.institutions add constraint institutions_data_source_check
  check (data_source in ('worksheet', 'synthetic', 'extracted'));
alter table public.institutions add column if not exists aliases text[] not null default '{}';

alter table public.courses drop constraint if exists courses_data_source_check;
alter table public.courses add constraint courses_data_source_check
  check (data_source in ('worksheet', 'synthetic', 'extracted'));
alter table public.courses drop constraint if exists courses_content_source_check;
alter table public.courses add constraint courses_content_source_check
  check (content_source in ('worksheet', 'synthetic', 'student_upload', 'extracted'));
alter table public.courses add column if not exists subject text;
alter table public.courses add column if not exists course_number text;

-- ---------------------------------------------------------------------
-- transcript ingestion
-- ---------------------------------------------------------------------
alter table public.transcripts add column if not exists source text not null default 'PORTAL_UPLOAD'
  check (source in ('PORTAL_UPLOAD', 'EMAIL', 'MANUAL_UPLOAD', 'INSTITUTION_INTEGRATION'));
update public.transcripts set source = case channel when 'etx' then 'INSTITUTION_INTEGRATION' when 'offline' then 'MANUAL_UPLOAD' else 'PORTAL_UPLOAD' end;
alter table public.transcripts add column if not exists extraction_status text not null default 'not_required'
  check (extraction_status in ('not_required', 'pending', 'extracted', 'needs_verification', 'verified', 'failed'));
alter table public.transcripts drop constraint if exists transcripts_data_source_check;
alter table public.transcripts add constraint transcripts_data_source_check
  check (data_source in ('worksheet', 'synthetic', 'extracted'));
alter table public.transcripts add column if not exists student_info jsonb not null default '{}';  -- extracted student block (name, id, program, ...)

create table public.transcript_documents (
  id               uuid primary key default gen_random_uuid(),
  transcript_id    uuid not null references public.transcripts(id) on delete cascade,
  application_id   uuid not null references public.applications(id) on delete cascade,
  source           text not null check (source in ('PORTAL_UPLOAD', 'EMAIL', 'MANUAL_UPLOAD', 'INSTITUTION_INTEGRATION')),
  storage_provider text not null check (storage_provider in ('supabase', 'local')),
  storage_bucket   text,
  storage_path     text not null,
  file_name        text not null,
  mime_type        text,
  size_bytes       integer not null check (size_bytes >= 0),
  sha256           text not null,
  page_count       integer,
  has_text_layer   boolean,
  uploaded_by      uuid references public.profiles(id) on delete set null,
  received_from    text,                                  -- e-mail sender / integration id (non-portal sources)
  created_at       timestamptz not null default now()
);
create index transcript_documents_transcript_idx on public.transcript_documents (transcript_id);
create index transcript_documents_sha_idx on public.transcript_documents (sha256);

create table public.transcript_processing_jobs (
  id             uuid primary key default gen_random_uuid(),
  transcript_id  uuid not null references public.transcripts(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  status         text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  stage          text not null default 'received',
  stages         jsonb not null default '[]',             -- [{key, label, status, detail, startedAt, finishedAt}]
  summary        jsonb not null default '{}',             -- courses, reused, aiRecommended, manualReview, rules ...
  error          text,
  attempts       integer not null default 0,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index transcript_jobs_transcript_idx on public.transcript_processing_jobs (transcript_id, created_at desc);
create index transcript_jobs_status_idx on public.transcript_processing_jobs (status) where status in ('queued', 'running');

create table public.ai_extraction_results (
  id                 uuid primary key default gen_random_uuid(),
  transcript_id      uuid not null references public.transcripts(id) on delete cascade,
  job_id             uuid references public.transcript_processing_jobs(id) on delete set null,
  document_id        uuid references public.transcript_documents(id) on delete set null,
  provider           text not null,                       -- layout-parser | claude
  model              text,
  document_type      text,                                -- e.g. 'Academic transcript (text PDF)'
  student            jsonb not null default '{}',         -- {name:{value,confidence}, studentId:..., institution:..., program:..., term:..., graduation:...}
  course_count       integer not null default 0,
  overall_confidence numeric(5,2),
  warnings           text[] not null default '{}',
  is_current         boolean not null default true,
  created_at         timestamptz not null default now()
);
create unique index ai_extraction_current on public.ai_extraction_results (transcript_id) where is_current;

alter table public.transcript_courses add column if not exists extraction_id uuid references public.ai_extraction_results(id) on delete set null;
alter table public.transcript_courses add column if not exists description text;     -- from a description supplement, when the transcript has one
alter table public.transcript_courses add column if not exists course_level text;
alter table public.transcript_courses add column if not exists subject text;
alter table public.transcript_courses add column if not exists needs_verification boolean not null default false;
alter table public.transcript_courses add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.transcript_courses add column if not exists verified_at timestamptz;
alter table public.transcript_courses drop constraint if exists transcript_courses_data_source_check;
alter table public.transcript_courses add constraint transcript_courses_data_source_check
  check (data_source in ('worksheet', 'synthetic', 'extracted'));

create table public.ai_confidence_scores (
  id                   uuid primary key default gen_random_uuid(),
  extraction_id        uuid not null references public.ai_extraction_results(id) on delete cascade,
  transcript_course_id uuid references public.transcript_courses(id) on delete cascade,  -- null = student-level field
  field                text not null,                     -- code, title, credits, grade, term, name, studentId, institution ...
  extracted_value      text,
  confidence           numeric(5,2) not null check (confidence between 0 and 100),
  corrected_value      text,
  corrected_by         uuid references public.profiles(id) on delete set null,
  corrected_at         timestamptz,
  created_at           timestamptz not null default now()
);
create index ai_confidence_course_idx on public.ai_confidence_scores (transcript_course_id);
create index ai_confidence_extraction_idx on public.ai_confidence_scores (extraction_id);

-- ---------------------------------------------------------------------
-- institutional policy (thresholds are configuration, not code)
-- ---------------------------------------------------------------------
create table public.evaluation_policies (
  id                         uuid primary key default gen_random_uuid(),
  policy_version             text not null unique,       -- e.g. 'P-2026.1'
  reuse_min_confidence       integer not null default 90 check (reuse_min_confidence between 50 and 100),
  similar_min_confidence     integer not null default 70 check (similar_min_confidence between 30 and 100),
  ai_recommend_min_confidence integer not null default 90 check (ai_recommend_min_confidence between 50 and 100),
  auto_close_known           boolean not null default false,  -- close reused equivalencies without a human (institutional opt-in)
  auto_close_min_approvals   integer not null default 3 check (auto_close_min_approvals >= 1),
  review_after_years         integer not null default 5 check (review_after_years between 1 and 20),
  is_current                 boolean not null default true,
  notes                      text,
  updated_by                 uuid references public.profiles(id) on delete set null,
  created_at                 timestamptz not null default now(),
  check (similar_min_confidence <= reuse_min_confidence)
);
create unique index evaluation_policies_one_current on public.evaluation_policies (is_current) where is_current;
insert into public.evaluation_policies (policy_version, notes)
values ('P-2026.1', 'Initial policy: reuse approved equivalencies at 90%+ match; AI recommendations need 90%+; evaluators confirm everything.');

-- ---------------------------------------------------------------------
-- equivalency knowledge base
-- ---------------------------------------------------------------------
drop index if exists public.equivalencies_active_source;
alter table public.equivalencies add column if not exists status text not null default 'active'
  check (status in ('active', 'expired', 'superseded', 'under_review', 'rejected'));
update public.equivalencies set status = case when is_active then 'active' else 'expired' end;
alter table public.equivalencies drop column if exists is_active;
alter table public.equivalencies add column is_active boolean generated always as (status = 'active') stored;
create unique index equivalencies_active_source on public.equivalencies (source_course_id) where status = 'active';
create index equivalencies_status_idx on public.equivalencies (status);

alter table public.equivalencies add column if not exists award_credits numeric(5,2);
alter table public.equivalencies add column if not exists effective_from date;           -- null = approved_on
alter table public.equivalencies add column if not exists effective_until date;
alter table public.equivalencies add column if not exists academic_year text;            -- e.g. '2026-27'
alter table public.equivalencies add column if not exists course_version text;           -- source catalog version / credits at approval
alter table public.equivalencies add column if not exists policy_version text;
alter table public.equivalencies add column if not exists current_version integer not null default 1;
alter table public.equivalencies add column if not exists status_reason text;
alter table public.equivalencies add column if not exists updated_at timestamptz not null default now();
alter table public.equivalencies add constraint equivalencies_effective_window check (effective_until is null or effective_from is null or effective_until >= effective_from);
create trigger equivalencies_updated_at before update on public.equivalencies for each row execute function public.set_updated_at();

-- other source courses that the department confirmed are the same course (renumbered / recoded / cross-listed)
create table public.equivalency_aliases (
  id               uuid primary key default gen_random_uuid(),
  equivalency_id   uuid not null references public.equivalencies(id) on delete cascade,
  source_course_id uuid not null references public.courses(id) on delete cascade,
  match_confidence integer,
  added_by         uuid references public.evaluators(id) on delete set null,
  course_evaluation_id uuid references public.course_evaluations(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (equivalency_id, source_course_id)
);
create index equivalency_aliases_source_idx on public.equivalency_aliases (source_course_id);

create table public.equivalency_versions (
  id                uuid primary key default gen_random_uuid(),
  equivalency_id    uuid not null references public.equivalencies(id) on delete cascade,
  version           integer not null,
  target_course_id  uuid references public.courses(id),
  award_label       text not null,
  award_credits     numeric(5,2),
  status            text not null check (status in ('active', 'expired', 'superseded', 'under_review', 'rejected')),
  effective_from    date,
  effective_until   date,
  academic_year     text,
  course_version    text,
  policy_version    text,
  change_type       text not null check (change_type in ('created', 'approved_again', 'target_changed', 'status_changed', 'dates_changed', 'imported')),
  change_reason     text,
  changed_by        uuid references public.profiles(id) on delete set null,
  approved_by       uuid references public.evaluators(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index equivalency_versions_eq_idx on public.equivalency_versions (equivalency_id, created_at);

create table public.equivalency_evidence (
  id                   uuid primary key default gen_random_uuid(),
  equivalency_id       uuid not null references public.equivalencies(id) on delete cascade,
  version              integer not null,
  kind                 text not null check (kind in ('evaluator_decision', 'evaluator_rejection', 'worksheet', 'seed', 'admin_action', 'ai_recommendation')),
  course_evaluation_id uuid references public.course_evaluations(id) on delete set null,
  decision_id          uuid references public.evaluation_decisions(id) on delete set null,
  evaluator_id         uuid references public.evaluators(id) on delete set null,
  ai_match_pct         integer,
  ai_agreed            boolean,
  summary              text not null,
  created_at           timestamptz not null default now()
);
create index equivalency_evidence_eq_idx on public.equivalency_evidence (equivalency_id, created_at);

create table public.equivalency_usage (
  id                   uuid primary key default gen_random_uuid(),
  equivalency_id       uuid not null references public.equivalencies(id) on delete cascade,
  course_evaluation_id uuid not null references public.course_evaluations(id) on delete cascade,
  application_id       uuid not null references public.applications(id) on delete cascade,
  student_id           uuid not null references public.students(id) on delete cascade,
  match_type           text not null check (match_type in ('exact', 'alias', 'fuzzy')),
  match_confidence     integer not null check (match_confidence between 0 and 100),
  outcome              text not null default 'reused' check (outcome in ('reused', 'confirmed', 'declined', 'auto_closed')),
  used_at              timestamptz not null default now(),
  unique (equivalency_id, course_evaluation_id)
);
create index equivalency_usage_eq_idx on public.equivalency_usage (equivalency_id, used_at);

-- the recommendation records which evaluation path the course took and why
alter table public.ai_recommendations add column if not exists evaluation_path text
  check (evaluation_path in ('known_equivalency', 'ai_recommended', 'manual_review', 'policy_rule'));
alter table public.ai_recommendations add column if not exists kb_equivalency_id uuid references public.equivalencies(id) on delete set null;
alter table public.ai_recommendations add column if not exists kb_match jsonb;           -- {type, confidence, signals[], sourceCode, approvals...}
alter table public.evaluation_evidence drop constraint if exists evaluation_evidence_kind_check;
alter table public.evaluation_evidence add constraint evaluation_evidence_kind_check
  check (kind in ('syllabus', 'description', 'learning_outcomes', 'credit_hours', 'grade', 'course_level', 'worksheet_match', 'past_decision', 'document', 'knowledge_base', 'extraction'));

-- which equivalency an evaluator decision created or reused (learning loop audit)
alter table public.evaluation_decisions add column if not exists equivalency_id uuid references public.equivalencies(id) on delete set null;

-- history of every equivalency as it exists today (backfill for the seeded rows)
insert into public.equivalency_versions (equivalency_id, version, target_course_id, award_label, status, effective_from, change_type, change_reason)
select id, 1, target_course_id, award_label, status, approved_on, 'imported', 'Imported from the ' || origin || ' equivalency list'
  from public.equivalencies;

-- ---------------------------------------------------------------------
-- knowledge-base read model: one row per equivalency with its usage
-- ---------------------------------------------------------------------
create or replace view public.v_equivalency_kb as
select
  e.id, e.code, e.status, e.origin, e.award_label, e.award_credits, e.approved_on, e.approved_by_label, e.approved_by,
  coalesce(e.effective_from, e.approved_on) as effective_from, e.effective_until, e.academic_year, e.course_version, e.policy_version,
  e.current_version, e.status_reason, e.created_at, e.updated_at,
  sc.id as source_course_id, sc.code as source_code, sc.title as source_title, sc.credits as source_credits, sc.level as source_level,
  si.id as source_institution_id, si.name as source_institution,
  tc.id as target_course_id, tc.code as target_code, tc.title as target_title, tc.credits as target_credits,
  coalesce(u.uses, 0) as times_used, coalesce(u.students, 0) as students_benefited, u.last_used_at,
  coalesce(ev.approvals, 0) as approvals, coalesce(ev.rejections, 0) as rejections, ev.last_approved_at
from public.equivalencies e
join public.courses sc on sc.id = e.source_course_id
join public.institutions si on si.id = sc.institution_id
left join public.courses tc on tc.id = e.target_course_id
left join (
  select equivalency_id, count(*)::int as uses, count(distinct student_id)::int as students, max(used_at) as last_used_at
    from public.equivalency_usage group by equivalency_id) u on u.equivalency_id = e.id
left join (
  select equivalency_id,
         count(*) filter (where kind = 'evaluator_decision')::int as approvals,
         count(*) filter (where kind = 'evaluator_rejection')::int as rejections,
         max(created_at) filter (where kind = 'evaluator_decision') as last_approved_at
    from public.equivalency_evidence group by equivalency_id) ev on ev.equivalency_id = e.id;

-- ---------------------------------------------------------------------
-- security: same model as every other table (API-only access)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['transcript_documents','transcript_processing_jobs','ai_extraction_results','ai_confidence_scores',
                           'evaluation_policies','equivalency_aliases','equivalency_versions','equivalency_evidence','equivalency_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
alter view public.v_equivalency_kb set (security_invoker = true);
revoke all on public.v_equivalency_kb from anon, authenticated;
