-- =====================================================================
-- Transfer-credit evaluation: core schema
--
--   Student → Application → Transcript → Transcript courses
--          → Course evaluation → AI recommendation (+ evidence)
--          → Evaluator assignment → Evaluation decision → History
--
-- Reference data comes from the sponsor worksheet where it exists
-- (institutions, programs, course codes/titles/credits, course-match
-- levels). Everything else is Synthetic Data and is labelled with a
-- `data_source` column so the UI can show where a value came from.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- reference data
-- ---------------------------------------------------------------------
create table public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  short_name    text,
  credit_system text not null default 'Semester' check (credit_system in ('Semester', 'Quarter')),
  city          text,
  is_target     boolean not null default false,
  data_source   text not null check (data_source in ('worksheet', 'synthetic')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index institutions_one_target on public.institutions (is_target) where is_target;

create table public.departments (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- e.g. 'CS'
  name          text not null,
  college       text,
  subject_codes text[] not null default '{}',         -- BU subject prefixes the department owns
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.programs (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  program_area   text not null,                       -- worksheet "Program area"
  name           text not null,
  degree         text,
  school         text,
  key_rules      text,
  source_url     text,
  program_match  text,                                -- worksheet match strength vs BU
  notes          text,
  data_source    text not null check (data_source in ('worksheet', 'synthetic')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (institution_id, program_area)
);

create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions(id) on delete cascade,
  department_id     uuid references public.departments(id),
  code              text not null,
  title             text not null,
  program_area      text,
  credits           numeric(5,2) not null check (credits >= 0),
  credit_system     text not null default 'Semester' check (credit_system in ('Semester', 'Quarter')),
  level             text check (level in ('Introductory', 'Intermediate', 'Advanced')),
  description       text,
  learning_outcomes text,
  prerequisites     text,                             -- null = not in the data set
  requirement_group text,                             -- target catalog: e.g. 'Core (Group A)'
  is_bu_only        boolean not null default false,   -- rule R6 (Group C)
  info_on_file      boolean not null default true,    -- false = description/syllabus not provided yet
  verified          boolean,
  source_url        text,
  data_source       text not null check (data_source in ('worksheet', 'synthetic')),  -- code/title/credits
  content_source    text not null default 'synthetic' check (content_source in ('worksheet', 'synthetic', 'student_upload')), -- description/outcomes
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (institution_id, code)
);
create index courses_institution_idx on public.courses (institution_id);
create index courses_department_idx on public.courses (department_id);

create table public.course_syllabi (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  content     text not null,
  source      text not null default 'catalog' check (source in ('catalog', 'student_upload')),
  data_source text not null default 'synthetic' check (data_source in ('worksheet', 'synthetic', 'student_upload')),
  created_at  timestamptz not null default now()
);
create index course_syllabi_course_idx on public.course_syllabi (course_id);

create table public.worksheet_course_matches (
  id                     uuid primary key default gen_random_uuid(),
  target_course_id       uuid not null references public.courses(id) on delete cascade,
  partner_institution_id uuid not null references public.institutions(id) on delete cascade,
  partner_course_code    text not null,
  partner_course_id      uuid references public.courses(id),
  match_level            text not null check (match_level in ('Likely equivalent', 'Partial - syllabus review', 'No equivalent found', 'Must be taken at BU')),
  notes                  text,
  data_source            text not null default 'worksheet' check (data_source = 'worksheet'),
  created_at             timestamptz not null default now(),
  unique (target_course_id, partner_institution_id, partner_course_code)
);

create table public.transfer_rules (
  id          text primary key,                       -- R1 .. R11, W
  name        text not null,
  detail      text not null,
  applies_to  text,
  source      text,
  kind        text not null check (kind in ('stop', 'change', 'process')),
  created_at  timestamptz not null default now()
);

create table public.program_requirements (
  id                uuid primary key default gen_random_uuid(),
  program_area      text not null,
  name              text not null,
  requirement_group text not null,                    -- matches courses.requirement_group
  needed            integer not null check (needed >= 0),
  assumed           boolean not null default false,
  bu_only           boolean not null default false,
  sort_order        integer not null default 0,
  data_source       text not null default 'synthetic' check (data_source in ('worksheet', 'synthetic')),
  unique (program_area, name)
);

create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                    -- e.g. 'FA26'
  name       text not null,                           -- e.g. 'Fall 2026 transfer season'
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create unique index seasons_one_current on public.seasons (is_current) where is_current;

-- ---------------------------------------------------------------------
-- people (Supabase Auth users → profiles → students / evaluators)
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('student', 'evaluator', 'admin')),
  full_name  text not null,
  email      text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id               uuid primary key default gen_random_uuid(),
  student_number   text not null unique,              -- e.g. 'STU-001'
  profile_id       uuid unique references public.profiles(id) on delete set null,
  full_name        text not null,
  email            text,
  intended_major   text not null,
  start_term       text not null,                     -- e.g. 'Fall 2026'
  start_date       date not null,
  previous_program text,
  scenario_note    text,
  data_source      text not null default 'synthetic' check (data_source in ('worksheet', 'synthetic')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.evaluators (
  id                    uuid primary key default gen_random_uuid(),
  staff_code            text not null unique,         -- e.g. 'DEP-CS1'
  profile_id            uuid unique references public.profiles(id) on delete set null,
  full_name             text not null,
  title                 text not null,
  unit                  text not null check (unit in ('credit_evaluation', 'department')),
  department_id         uuid references public.departments(id),
  subject_codes         text[] not null default '{}', -- subject expertise (BU prefixes)
  specializations       text[] not null default '{}',
  program_expertise     text[] not null default '{}',
  course_levels         text[] not null default '{Introductory,Intermediate,Advanced}',
  target_course_pattern text,                         -- regex on target course codes (specialization)
  max_active_load       integer not null default 25 check (max_active_load > 0),
  is_available          boolean not null default true,
  is_active             boolean not null default true,
  avatar_tone           text,
  historical_decisions  integer not null default 0,   -- decisions before this system (Synthetic Data)
  data_source           text not null default 'synthetic' check (data_source in ('worksheet', 'synthetic')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (unit = 'credit_evaluation' or department_id is not null)
);
create index evaluators_department_idx on public.evaluators (department_id);

-- historical activity before go-live (Synthetic Data). Live decisions come from evaluation_decisions.
create table public.evaluator_daily_stats (
  evaluator_id uuid not null references public.evaluators(id) on delete cascade,
  day          date not null,
  decisions    integer not null check (decisions >= 0),
  data_source  text not null default 'synthetic' check (data_source = 'synthetic'),
  primary key (evaluator_id, day)
);

-- ---------------------------------------------------------------------
-- applications, transcripts and courses
-- ---------------------------------------------------------------------
create table public.applications (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,         -- e.g. 'TCR-26-001'
  student_id            uuid not null references public.students(id) on delete cascade,
  season_id             uuid not null references public.seasons(id),
  target_institution_id uuid not null references public.institutions(id),
  target_program_id     uuid references public.programs(id),
  status                text not null default 'received' check (status in (
                          'received', 'processing', 'in_review', 'waiting_for_confirmation',
                          'needs_information', 'confirmed', 'completed', 'withdrawn')),
  intake_channel        text not null check (intake_channel in ('online', 'etx', 'offline', 'mixed')),
  submitted_at          timestamptz not null default now(),
  completed_at          timestamptz,
  completed_by          uuid references public.evaluators(id),
  internal_notes        text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null))
);
create index applications_student_idx on public.applications (student_id);
create index applications_status_idx on public.applications (status);
create index applications_season_idx on public.applications (season_id);

create table public.transcripts (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications(id) on delete cascade,
  source_institution_id uuid references public.institutions(id),
  channel               text not null check (channel in ('online', 'etx', 'offline')),
  file_name             text,
  file_count            integer not null default 1,
  pages                 integer,
  status                text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed')),
  ocr_confidence        numeric(5,2),                 -- scanned paper only
  received_at           timestamptz not null default now(),
  process_after         timestamptz,                  -- intake queue: earliest time the agent may read it
  processed_at          timestamptz,
  data_source           text not null default 'synthetic' check (data_source in ('worksheet', 'synthetic')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index transcripts_application_idx on public.transcripts (application_id);
create index transcripts_queue_idx on public.transcripts (status, process_after) where status in ('received', 'processing');

create table public.transcript_courses (
  id               uuid primary key default gen_random_uuid(),
  transcript_id    uuid not null references public.transcripts(id) on delete cascade,
  application_id   uuid not null references public.applications(id) on delete cascade,
  row_code         text not null unique,              -- e.g. 'TR-001'
  line_no          integer not null,
  course_code      text not null,
  title            text not null,
  term             text not null,
  credit_system    text not null check (credit_system in ('Semester', 'Quarter')),
  source_credits   numeric(5,2) not null check (source_credits >= 0),
  grade            text not null,
  course_id        uuid references public.courses(id),
  scan_confidence  numeric(5,2),                      -- OCR confidence for this line, if scanned
  scan_read_value  text,
  data_source      text not null default 'synthetic' check (data_source in ('worksheet', 'synthetic')),
  created_at       timestamptz not null default now(),
  unique (application_id, line_no)
);
create index transcript_courses_transcript_idx on public.transcript_courses (transcript_id);

-- ---------------------------------------------------------------------
-- evaluation
-- ---------------------------------------------------------------------
create table public.course_evaluations (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.applications(id) on delete cascade,
  transcript_course_id uuid not null unique references public.transcript_courses(id) on delete cascade,
  pipeline_path        text not null check (pipeline_path in ('Auto-applied', 'Precedent', 'Needs review', 'Rule', 'Evaluator decided')),
  state                text not null default 'pending' check (state in ('pending', 'info_requested', 'confirmed', 'rejected', 'overridden')),
  student_status       text not null check (student_status in ('Confirmed', 'Likely', 'Under review', 'Not transferable')),
  suggestion           text not null,                 -- current award shown to the student
  requested_credits    numeric(5,2) not null,         -- after quarter conversion
  awarded_credits      numeric(5,2) not null default 0, -- credits attached to the current suggestion (final once decided)
  system_reason        text,
  trace                jsonb not null default '[]',
  rules_fired          text[] not null default '{}',
  baseline             jsonb not null default '{}',  -- engine outcome before any decision (used by reopen)
  decided_by           uuid references public.evaluators(id),
  decided_at           timestamptz,
  decision_note        text,                          -- comment shown to the student
  info_received_at     timestamptz,
  current_recommendation_id uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((state in ('confirmed', 'rejected', 'overridden')) = (decided_at is not null))
);
create index course_evaluations_application_idx on public.course_evaluations (application_id);
create index course_evaluations_state_idx on public.course_evaluations (state);

create table public.ai_recommendations (
  id                   uuid primary key default gen_random_uuid(),
  course_evaluation_id uuid not null references public.course_evaluations(id) on delete cascade,
  version              integer not null,
  is_current           boolean not null default true,
  engine_version       text not null,
  trigger              text not null check (trigger in ('intake', 'student_upload', 'reevaluation')),
  decision             text not null check (decision in ('Accept', 'Accept as elective', 'Partial credit', 'Reject', 'Needs info')),
  award_label          text not null,
  award_credits        numeric(5,2) not null,
  target_course_id     uuid references public.courses(id),
  target_code          text,
  match_pct            integer check (match_pct between 0 and 100),
  confidence           text not null check (confidence in ('High', 'Medium', 'Low', 'n/a')),
  auto_eligible        boolean not null default false, -- pre-approved: approved equivalency or hard rule
  criteria             jsonb not null default '[]',
  reasons              jsonb not null default '[]',
  exceptions           text[] not null default '{}',
  candidates           jsonb not null default '[]',
  covered_topics       text[] not null default '{}',
  missing_topics       text[] not null default '{}',
  partial_credit       jsonb,
  equivalency_code     text,
  worksheet_level      text,
  precedent_codes      text[] not null default '{}',
  similar_precedent    text,
  generated_at         timestamptz not null default now(),
  unique (course_evaluation_id, version)
);
create unique index ai_recommendations_current on public.ai_recommendations (course_evaluation_id) where is_current;

alter table public.course_evaluations
  add constraint course_evaluations_current_rec_fk foreign key (current_recommendation_id)
  references public.ai_recommendations(id) on delete set null;

create table public.documents (
  id                     uuid primary key default gen_random_uuid(),
  application_id         uuid not null references public.applications(id) on delete cascade,
  course_evaluation_id   uuid references public.course_evaluations(id) on delete set null,
  uploaded_by            uuid references public.profiles(id) on delete set null,
  kind                   text not null check (kind in ('transcript', 'syllabus', 'supporting')),
  file_name              text not null,
  mime_type              text,
  size_bytes             integer,
  sha256                 text,
  storage_path           text,                        -- Supabase Storage path when storage is enabled
  extracted_text         text,
  created_at             timestamptz not null default now()
);
create index documents_application_idx on public.documents (application_id);

create table public.evaluation_evidence (
  id                   uuid primary key default gen_random_uuid(),
  course_evaluation_id uuid not null references public.course_evaluations(id) on delete cascade,
  recommendation_id    uuid not null references public.ai_recommendations(id) on delete cascade,
  kind                 text not null check (kind in ('syllabus', 'description', 'learning_outcomes', 'credit_hours', 'grade', 'course_level', 'worksheet_match', 'past_decision', 'document')),
  label                text not null,
  available            boolean not null,
  content              text,
  source_label         text,                          -- Worksheet | Synthetic Data | Student upload | System-generated
  document_id          uuid references public.documents(id) on delete set null,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now()
);
create index evaluation_evidence_rec_idx on public.evaluation_evidence (recommendation_id);

create table public.evaluator_assignments (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.applications(id) on delete cascade,
  course_evaluation_id uuid references public.course_evaluations(id) on delete cascade,
  evaluator_id         uuid not null references public.evaluators(id),
  assignment_type      text not null check (assignment_type in ('case_owner', 'department_review')),
  status               text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed', 'reassigned', 'cancelled')),
  routing_reason       text not null,
  match_basis          jsonb not null default '{}',   -- subject, specialization, workload at assignment time
  assigned_by          text not null default 'routing-engine',
  assigned_at          timestamptz not null default now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((assignment_type = 'case_owner') = (course_evaluation_id is null))
);
create unique index evaluator_assignments_one_owner on public.evaluator_assignments (application_id)
  where assignment_type = 'case_owner' and status in ('assigned', 'in_progress');
create unique index evaluator_assignments_one_reviewer on public.evaluator_assignments (course_evaluation_id)
  where assignment_type = 'department_review' and status in ('assigned', 'in_progress');
create index evaluator_assignments_evaluator_idx on public.evaluator_assignments (evaluator_id, status);
create index evaluator_assignments_application_idx on public.evaluator_assignments (application_id);

create table public.evaluation_decisions (
  id                   uuid primary key default gen_random_uuid(),
  course_evaluation_id uuid not null references public.course_evaluations(id) on delete cascade,
  application_id       uuid not null references public.applications(id) on delete cascade,
  evaluator_id         uuid not null references public.evaluators(id),
  recommendation_id    uuid references public.ai_recommendations(id) on delete set null,
  action               text not null check (action in ('accept', 'reject', 'request_information', 'override', 'reopen')),
  award_label          text,
  award_credits        numeric(5,2),
  student_comment      text,
  audit_reason         text,
  ai_decision          text,
  ai_award             text,
  ai_match_pct         integer,
  differs_from_ai      boolean not null default false,
  review_seconds       integer check (review_seconds >= 0),
  created_at           timestamptz not null default now(),
  check (action <> 'override' or audit_reason is not null),
  check (not differs_from_ai or audit_reason is not null)
);
create index evaluation_decisions_evaluator_idx on public.evaluation_decisions (evaluator_id, created_at);
create index evaluation_decisions_course_idx on public.evaluation_decisions (course_evaluation_id);

create table public.information_requests (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.applications(id) on delete cascade,
  course_evaluation_id uuid references public.course_evaluations(id) on delete cascade,
  requested_by         uuid not null references public.evaluators(id),
  message              text not null check (length(message) between 3 and 2000),
  status               text not null default 'open' check (status in ('open', 'answered', 'cancelled')),
  requested_at         timestamptz not null default now(),
  answered_at          timestamptz,
  response_document_id uuid references public.documents(id) on delete set null,
  check ((status = 'answered') = (answered_at is not null))
);
create index information_requests_application_idx on public.information_requests (application_id, status);

create table public.evaluation_history (
  id                   uuid primary key default gen_random_uuid(),
  application_id       uuid not null references public.applications(id) on delete cascade,
  course_evaluation_id uuid references public.course_evaluations(id) on delete cascade,
  actor_type           text not null check (actor_type in ('agent', 'system', 'evaluator', 'student', 'admin', 'school', 'mail_room')),
  actor_label          text not null,
  actor_profile_id     uuid references public.profiles(id) on delete set null,
  event_type           text not null,                 -- e.g. intake.received, course.accepted, case.opened
  message              text not null,
  visibility           text not null default 'internal' check (visibility in ('internal', 'student')),
  metadata             jsonb not null default '{}',
  created_at           timestamptz not null default now()
);
create index evaluation_history_application_idx on public.evaluation_history (application_id, created_at);

create table public.notifications (
  id                   uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  title                text not null,
  body                 text not null,
  link                 jsonb not null default '{}',
  read_at              timestamptz,
  created_at           timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_profile_id, created_at desc);

-- equivalency database (worksheet "Likely equivalent" rows + approved decisions)
create table public.equivalencies (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,         -- e.g. 'EQ-001'
  source_course_id      uuid not null references public.courses(id) on delete cascade,
  target_course_id      uuid references public.courses(id),
  award_label           text not null,
  outcome               text,
  approved_on           date not null,
  approved_by_label     text,
  approved_by           uuid references public.evaluators(id),
  origin                text not null check (origin in ('worksheet', 'synthetic', 'evaluator_decision')),
  course_evaluation_id  uuid references public.course_evaluations(id) on delete set null,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);
create unique index equivalencies_active_source on public.equivalencies (source_course_id) where is_active;

-- past decisions (precedents) — Synthetic Data
create table public.past_decisions (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,          -- e.g. 'PD-001'
  institution_id       uuid not null references public.institutions(id),
  course_code          text not null,                 -- may combine courses: 'CS 2100+CS 2700'
  source_course_id     uuid references public.courses(id),
  proposed_target_code text not null,
  decision             text not null check (decision in ('BU equivalent', 'Partial / elective', 'Elective credit', 'No credit')),
  awarded_label        text not null,
  reason               text not null,
  credit_system        text,
  decided_on           date not null,
  evaluator_label      text not null,
  days_to_decision     integer check (days_to_decision >= 0),
  ai_top1              text,
  is_standard          boolean not null default false,
  standard_adopted_at  timestamptz,
  standard_adopted_by  uuid references public.profiles(id),
  data_source          text not null default 'synthetic' check (data_source = 'synthetic'),
  created_at           timestamptz not null default now()
);
create index past_decisions_course_idx on public.past_decisions (institution_id, course_code);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['institutions','departments','programs','courses','profiles','students','evaluators',
                           'applications','transcripts','course_evaluations','evaluator_assignments'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;
