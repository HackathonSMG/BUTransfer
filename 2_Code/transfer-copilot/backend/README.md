# Transfer Credit Portal: production implementation (Node.js + Supabase)

Supabase (Postgres + Auth) is the single source of truth. A Node.js/Express API owns every
business rule: matching, routing, status, priority, risk, permissions. The browser frontend
(`../frontend`) is a thin client: it keeps the prototype's screens and workflows, and every
number and record on them comes from the API. No business data is hardcoded in the frontend.

```
 Browser (frontend/)            Node.js API (backend/)                      Supabase
 ─────────────────────          ───────────────────────────────            ──────────────────
 sign-in ──────────── /auth ──► auth.service ── signInWithPassword ──────► Auth (anon key)
 student / evaluator  /api ──►  middleware: authenticate · requireRole
 admin screens                  controllers → services → repositories ──► Postgres (DATABASE_URL)
                                 └ engine (TF-IDF + rules), routing,          RLS on, no policies:
                                   intake worker, scenario runner             only the API reads/writes
```


## Transfer Credit Intelligence: the knowledge base ("every transcript makes the next one faster")

```
 Transcript sources                 AI processing (transcript_processing_jobs, stage by stage)
 ───────────────────                ─────────────────────────────────────────────────────────
 Portal upload  ──┐                 received → reading → extracting → history → evaluating → routing → ready
 Manual / mail  ──┼─► ingestion ──► original in Supabase Storage (private bucket)
 Email          ──┤    (sources.js)  layout parser (text PDFs) · Claude vision (scans, optional)
 Integration    ──┘                  per-field confidence + cross-checks (quality points, totals, name)
                                             │
                                             ▼
                         Equivalency knowledge base (same school; exact code, confirmed alias,
                         or same course under another code format ≥ policy threshold)
                          ┌──────────────┬──────────────────────┬────────────────────────┐
                    known equivalency   AI recommendation       manual review           policy rule
                    reused, no dept     ≥ 90% match, evaluator  low confidence, missing  grade < C, W,
                    review (usage row)  confirms                info, exception          Econ cap
                          └──────────────┴──────────┬───────────┴────────────────────────┘
                                                    ▼
                         evaluator decision ─► equivalency created / reinforced / flagged
                                               (versions, evidence, aliases) ─► next student
```

* **Unified sign-in.** One page: pick Student, Evaluator or Admin, then sign in. The account's role must match the role chosen.
* **Upload → live processing.** Students (or Credit Evaluation staff, as `MANUAL_UPLOAD`) upload a PDF, image or text export.
  `POST /api/transcripts/upload` stores the original, creates the application if needed and starts a job; the UI polls
  `GET /api/transcripts/:id/processing-status` and shows the real stages and an *AI activity* panel.
* **Extraction you can trust.** Every field has a confidence. A value below 80% (for example a grade that contradicts the
  quality points) adds the exception *Verify extracted value*, which forces manual review. Staff correct or confirm lines
  in the case page's **AI extraction** tab (`PATCH /api/transcripts/:id/courses/:courseId`); the course is re-evaluated
  and the original reading is kept (`ai_confidence_scores.extracted_value` vs `corrected_value`).
* **Knowledge-base lookup** (`services/engine/kb-matcher.js`). Matching is per source institution, on code (subject
  families: CS = CSC = COMP…, number must agree), title, credits and description. Title similarity alone never reuses
  a decision. An identical code is not reused when the title or credits changed (curriculum change).
* **Three evaluation paths**, stored on each recommendation (`ai_recommendations.evaluation_path`) and shown to the
  evaluator as *Evaluation reason · Previously approved / AI recommendation / Manual review required*.
* **Learning loop** (`services/knowledge.service.js`). Each content decision creates, reinforces or flags an equivalency
  with a version row and evidence. A different award never overwrites an approved equivalency: it is flagged *under
  review*. Rejections are remembered too. Reopening a decision withdraws what it taught.
* **No duplicates.** Before an approval the UI calls `GET /api/course-evaluations/:id/equivalency-check`; if an
  equivalency already covers the course, the evaluator can reuse it (an alias is recorded), review its history, or
  continue. `POST /api/equivalencies` refuses duplicates with `409` and the existing record.
* **Version-aware.** Equivalencies have status (active, expired, superseded, under review, rejected), effective dates,
  academic year, course version and policy version; every change is an `equivalency_versions` row.
* **Admin → Knowledge base.** Search and filter (cursor pagination), detail drawer (versions, evidence, students who
  benefited, aliases), expire / review / reactivate / change target, *Insights* (learning curve, courses repeatedly
  reviewed by hand, inconsistent decisions, equivalencies that may need re-evaluation, AI accuracy and overrides) and
  *Policy* (thresholds, optional auto-close of known equivalencies, versioned; off by default).
* **AI is never the final authority.** Equivalencies come only from evaluator decisions or an administrator. Auto-close
  exists only as an explicit institutional policy, and every auto-closed course is logged.

**Demo (4 scenarios).** Students STU-020 to STU-023 (Ava Thompson, Liam Carter, Zoe Nguyen, Mason Reed) have no
transcript yet; their sample PDFs are in `samples/transcripts/` (fictional Lakeshore State University, regenerate with
`npm run samples`). In demo mode the upload page offers each student their sample, and the **Guided demo** has a
"Every transcript makes the next one faster" scenario that runs all four end to end:

| # | Student | What happens |
|---|---|---|
| 1 | Ava | No equivalency yet. CS 101 → CAS CS 111 at ~94% (AI recommendation); Dr. Smith approves; saved as a new equivalency |
| 2 | Liam | Same CS 101 (and MATH 151): reused from the knowledge base, no department review |
| 3 | Zoe | CSC 101 reused by a 98% code-format match; CS 450 Advanced AI Systems at ~67% goes to manual review; a contradictory MATH 151 grade is flagged for verification |
| 4 | Mason | CS 450 reused from the decision made for Zoe |

`test/knowledge.test.js` runs exactly these scenarios against the API.

---

## 1. Prerequisites

- Node.js **20 or later** (tested on 22) and npm.
- A Supabase project (the hackathon one is `https://srehqamxvolzvosdpzej.supabase.co`).
- From the Supabase dashboard you need:
  - **Project URL** and **publishable (anon) key**: Project Settings → API. Public values, already in `.env.example`.
  - **Service-role (secret) key**: Project Settings → API. A server-side secret.
  - **Database connection string**: Project Settings → Database → Connection string. A server-side secret.
- Optional: the Supabase CLI (`npm i -g supabase`) if you prefer `supabase db push`.

## 2. Supabase setup

1. Open the project. In **Authentication → Providers**, keep **Email** enabled. For the demo
   accounts, the seed creates users with the email already confirmed, so no mail is sent.
2. Copy the connection string. Use the **Session pooler** URI if your network has no IPv6:
   `postgresql://postgres.srehqamxvolzvosdpzej:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`
3. Create the schema with one of these:
   - **Recommended:** `npm run db:migrate` (step 3 below). It applies the files in order and records them in `public.app_migrations`.
   - **Supabase CLI:** `supabase link --project-ref srehqamxvolzvosdpzej`, then `supabase db push` from `backend/`.
   - **SQL editor:** paste the three files in `supabase/migrations/` in name order and run each.

## 3. Database schema and migrations

| File | Contents |
|---|---|
| `20261026000100_core_schema.sql` | All tables, foreign keys, check constraints, indexes, `created_at`/`updated_at` with triggers |
| `20261026000200_views_and_functions.sql` | Views `v_evaluator_workload`, `v_evaluator_activity_daily`, `v_application_summary`; functions `next_application_reference()`, `next_equivalency_code()` |
| `20261026000300_security.sql` | RLS enabled on every table, all privileges revoked from `anon` and `authenticated`, views set to `security_invoker` |
| `20261026000400_knowledge_base.sql` | Transcript sources and documents, processing jobs, AI extraction results and per-field confidence, evaluation policies, the versioned equivalency knowledge base (versions, evidence, usage, aliases), view `v_equivalency_kb`, same RLS model |

**Main tables**

- **Reference:** `institutions`, `departments`, `programs`, `courses` (previous and target courses, prerequisites, requirement group), `course_syllabi`, `worksheet_course_matches`, `transfer_rules`, `program_requirements`, `seasons`.
- **People:** `profiles` (1:1 with `auth.users`, role `student | evaluator | admin`), `students`, `evaluators`, `evaluator_daily_stats`.
  - `evaluators` carries `unit`, `department_id`, `subject_codes`, `specializations`, `program_expertise`, `course_levels`, `target_course_pattern`, `max_active_load`, `is_available` and `is_active`.
- **Applications:** `applications`, `transcripts` (with `process_after` for queued intake), `transcript_courses`.
- **Evaluation:**
  - `course_evaluations`, one per transcript course, with the current state;
  - `ai_recommendations`, versioned with `is_current`, a new version on each re-score;
  - `documents`;
  - `evaluation_evidence`;
  - `evaluator_assignments`, with role `case_owner` or `department_review`;
  - `evaluation_decisions`, with `differs_from_ai` and `review_seconds`;
  - `information_requests`;
  - `evaluation_history`, with visibility `internal` or `student`;
  - `notifications`.
- **Learning:** `equivalencies`, with origin `worksheet`, `synthetic` or `evaluator_decision`; completed cases write back here. Also `past_decisions`.

Commands:

```bash
npm run db:migrate          # apply pending migrations
npm run db:reset            # drop everything the migrations created, re-apply and reseed (destructive)
```

## 4. Environment variables

Copy `.env.example` to `.env` and fill in the two secrets.

| Variable | Secret? | Purpose |
|---|---|---|
| `SUPABASE_URL` | public | Project URL |
| `SUPABASE_ANON_KEY` | public | Publishable key. Used by the API for `signInWithPassword` and token checks |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | Used by `npm run db:seed` to create demo users and by the API to read and write the private transcript bucket. Never sent to the browser |
| `DATABASE_URL` | **secret** | Postgres connection used by the API, migrations and seed |
| `DATABASE_SSL` | | `true` for Supabase |
| `PORT` | | API port (default 4000) |
| `AUTH_PROVIDER` | | `supabase` (always in deployments). `local` exists only for offline tests and is refused when `NODE_ENV=production` |
| `CORS_ORIGINS` | | Allowed browser origins, comma-separated |
| `SERVE_FRONTEND`, `FRONTEND_DIR` | | Serve `../frontend` from the API (same origin) |
| `DEMO_MODE` | | `true` shows demo accounts, the guided demo, demo reset and scenario "play". Set `false` in production |
| `DEMO_PASSWORD` | | Password given to seeded demo users |
| `INTAKE_WORKER_INTERVAL_MS` | | How often queued transcripts are processed (0 = off) |
| `UPLOAD_MAX_MB` | | Upload size limit |
| `STORAGE_PROVIDER`, `STORAGE_BUCKET`, `STORAGE_LOCAL_DIR` | | Where transcript originals are kept. `auto` = private Supabase Storage bucket (uses the service-role key, server-side) when configured, else a local folder (development) |
| `ANTHROPIC_API_KEY` | **secret, optional** | Enables the Claude vision reader for scanned transcripts and photos. Digital PDFs and text exports are read without it |
| `CLAUDE_MODEL` | | Model for the vision reader (default `claude-opus-5-5`) |
| `PROCESSING_STAGE_DELAY_MS` | | Minimum time each processing stage is shown in live demos (0 in production) |

The frontend has **no** keys at all. It only knows the API base URL (`frontend/config.js`).

## 5. Install dependencies

```bash
cd backend
npm install
```

## 6. Run the backend

```bash
npm run dev      # watch mode
npm start        # plain
```

Check it with `GET http://localhost:4000/api/health`. On start the server also runs the
intake worker, which reads queued transcripts when their `process_after` time is reached.

## 7. Run the frontend

- **Default:** the API serves it. Open **http://localhost:4000**.
- **Separately** (any static server):
  1. Set `window.APP_CONFIG = { apiBase: 'http://localhost:4000/api' }` in `frontend/config.js`.
  2. Add that origin to `CORS_ORIGINS`.
  3. Run, for example, `npx serve ../frontend -l 5173`.

## 8. Seed data

```bash
npm run db:seed
```

The seed is idempotent: it clears the business tables and recreates users. It loads:

- **Worksheet data first** (`../data/worksheet/*.csv`, exported from `BU_Transfer_Program_Course_Match.xlsx`):
  - BU, Northeastern and NYU courses and credits;
  - programs;
  - course-match levels, which become the worksheet equivalencies.
- **Synthetic Data** where the worksheet has none, labelled `data_source = 'synthetic'`:
  - 17 students and their transcripts and grades;
  - descriptions and syllabi;
  - past decisions;
  - 8 evaluators and 1 admin;
  - prerequisites;
  - two fictional schools.
- **Processing:** every application goes through the real pipeline (engine → recommendations → routing), and a few are moved into realistic states (completed, partly decided, waiting for information). Noah Patel's (STU-011) paper transcript is queued for about 10 minutes after seeding, so live intake can be shown.

Users are created in **Supabase Auth** with the service-role key. Profiles reference `auth.users(id)`.

Engine check: `npm run engine:check` compares the Node engine with the Python reference output (75 of 76 identical; MATH-UA 235 differs by design because its syllabus is missing until it is uploaded).

## 9. API endpoints

All routes are under `/api`. Every route except the public ones needs `Authorization: Bearer <access token>`.

**Public**

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/auth/login` | `{email, password}` → session (rate-limited) |
| POST | `/auth/refresh` | `{refreshToken}` → new session |
| GET | `/auth/demo-accounts` | Demo mode only |
| GET | `/demo/samples/:file` | Demo mode only; synthetic sample syllabus |

**Auth**: `GET /auth/me`, `POST /auth/logout`

**Student** (own data only)

| Method | Path |
|---|---|
| GET | `/students/me/application`: status, stage, credits, courses, requests |
| GET | `/students/me/transcript` |
| GET | `/students/me/degree-progress` |
| POST | `/students/me/courses/:id/documents`: upload a syllabus or description (re-scores the course if information was requested) |
| POST | `/students/me/requests/:id/documents`: answer an information request |

**Evaluator** (assigned or authorized work only)

| Method | Path |
|---|---|
| GET | `/evaluators/:id/dashboard`: total, season, today, pending, high priority, missing information, confidence bands, activity |
| GET | `/evaluators/:id/evaluations`: *My evaluations* (filters: `status`, `priority`, `subject`, `category`, `q`, `sort`, `dir`) |
| GET | `/evaluators/:id/metrics` |
| GET | `/applications`, `/applications/:id`, `/students`, `/students/:id` |
| GET | `/evaluations/:id`: case summary, attention list, courses |
| GET | `/evaluations/:id/courses`, `/evaluations/:id/history`, `/evaluations/:id/transcript` |
| GET | `/course-evaluations/:id`: previous course, target course, AI recommendation, evidence, similar evaluations, prerequisites, routing, permissions |
| PATCH | `/course-evaluations/:id/decision`: `{action: accept, reject, override or reopen, reason, comment, award, credits}`. Overrides and rejects need a reason |
| POST | `/course-evaluations/:id/request-information` |
| POST | `/evaluations/:id/open`, `/evaluations/:id/request-information`, `/evaluations/:id/bulk`, `/evaluations/:id/complete` |
| PATCH | `/evaluations/:id/notes` |
| GET | `/catalog/course-matches`, `/catalog/rules`, `/catalog/seasons/current` |
| GET/POST | `/notifications`, `/notifications/read` |
| GET | `/search?q=` |
| GET | `/intake/status`; POST `/intake/run` (Credit Evaluation or admin) |

**Transcripts and knowledge base**

| Method | Path | Who |
|---|---|---|
| POST | `/transcripts/upload` (multipart `file`; staff also `studentId`, `source`) → `201` + `Location` | student (own), Credit Evaluation, admin |
| GET | `/transcripts/:id`, `/transcripts/:id/courses`, `/transcripts/:id/processing-status` | owner student, staff with access |
| GET | `/transcripts/:id/document` (original file) | staff |
| POST | `/transcripts/:id/process` (re-run before any decision) | Credit Evaluation, admin |
| PATCH | `/transcripts/:id/courses/:courseId` (correct / verify extracted values) | staff |
| GET | `/transcripts/sources`, `/students/me/status` | staff / student |
| GET | `/equivalencies/search?q&status&institution&origin&cursor`, `/equivalencies/:id` | staff |
| POST · PATCH | `/equivalencies`, `/equivalencies/:id` (versioned; duplicates → 409) | admin |
| GET | `/course-evaluations/:id/equivalency-check?award=` | staff |
| POST | `/evaluations/:id/decision` (`{courseEvaluationId, action, …}`, same rules as the PATCH) | evaluator |
| GET | `/knowledge/stats`, `/knowledge/policy`; `/knowledge/insights` (admin) · PATCH `/knowledge/policy` (admin) | staff |

**Admin**

| Method | Path |
|---|---|
| GET | `/evaluators`; PATCH `/evaluators/:id` (availability, capacity, active, expertise) |
| POST | `/assignments/:id/reassign` |
| GET | `/admin/overview`, `/admin/reports/consistency`; POST `/admin/reports/consistency/standards` |
| GET | `/admin/scenarios`; POST `/admin/scenarios/:id/run` (rolled back) and `/admin/scenarios/:id/play` (demo mode) |
| POST | `/admin/intake/run`, `/admin/demo/reset` (demo mode) |

Errors use one format: `{ "error": { "code", "message", "details?" } }`, with status codes 400, 401, 403, 404, 409, 413, 422 and 500. Request bodies and queries are validated with zod.

## 10. User roles

| Role | Can | Cannot |
|---|---|---|
| **Student** | See their own application, transcript, progress, decisions and reasons; upload documents; answer requests | See other students, internal notes, scores or automation wording |
| **Evaluator, Credit Evaluation** (case owner) | See the cases they own; confirm equivalency and rule-based results; request information; complete the case and post credit | Decide courses routed to a department evaluator |
| **Evaluator, department** | See the cases that contain courses assigned to them; accept, reject or override (with a reason) or request information on **their** courses | See unrelated cases; complete a case |
| **Admin** | Everything above read-only, plus evaluator management, reassignment, reports, scenarios and demo reset | n/a |

Routing (backend, `routing.service`):

1. The Credit Evaluation owner is the one with the lightest workload.
2. Each course without an approved equivalency goes to the department that owns the target subject. The evaluator is chosen by:
   - specialization match +3;
   - program expertise +1;
   - course level +1;
   - at capacity −5;
   - unavailable −10;
   - inactive evaluators are excluded.

   Ties go to the lightest workload.

## 11. Demo credentials

All demo users share the password **`TransferDemo!2026`** (or your `DEMO_PASSWORD`). With `DEMO_MODE=true` the sign-in page lists them for one-click sign-in.

| Role | Email |
|---|---|
| Admin | `registrar.admin@staff.example.org` |
| Credit Evaluation | `dana.whitfield@staff.example.org`, `tomas.reyes@staff.example.org` |
| CS (Algorithms / Data Structures) | `michael.smith@staff.example.org` |
| CS (Systems / Programming Languages) | `elena.park@staff.example.org` |
| Economics | `alex.morgan@staff.example.org` |
| Mathematics | `ravi.menon@staff.example.org` |
| Psychology | `marcus.hall@staff.example.org` |
| Biology / Chemistry | `lena.fischer@staff.example.org` |
| Students | `firstname.lastname@students.example.org`, e.g. `omar.haddad@`, `daniel.kim@`, `ethan.brooks@`, `priya.shah@`, `grace.liu@`, `noah.patel@` |

All people and emails are Synthetic Data. Change `DEMO_PASSWORD` and set `DEMO_MODE=false` for any shared deployment.

## 12. End-to-end demo flow

Open http://localhost:4000, sign in (or pick a demo account), then click **Guided demo**. Every step signs in as the real person and calls the same API the screens use:

1. **High-confidence transfer**: Ethan Brooks. All courses have approved equivalencies; Dana confirms all and completes; Ethan sees 24 credits.
2. **Low confidence → department review**: Daniel Kim.
   - CS 2700 is routed to Dr. Smith and CS 3800 to Dr. Park; each confirms.
   - Credit Evaluation completes the case.
3. **Rejected course**: Priya Shah. BIOL-UA 11 is rejected (grade D); Priya sees the plain reason.
4. **Missing information**: Omar Haddad.
   - Dr. Menon requests the MATH-UA 235 syllabus, and Omar uploads `samples/MATH-UA-235_syllabus.pdf`.
   - The course is re-scored (83%, Math elective), Dr. Menon confirms, and Omar is notified.
5. **Override**: Grace Liu. Dr. Morgan overrides EC 204 to an economics elective with a reason, which is stored in history and shown to Grace.
6. **Live intake**: Noah Patel. The queued paper transcript is read, evaluated and routed by the worker (or by **Run intake now**).

By hand:

1. Sign in as `michael.smith@…` and open **My evaluations**, then click a row.
2. Compare the previous and target courses, then read *Why?* and the evidence.
3. Decide with keyboard shortcuts: A accept, R reject, O override, I request information, J/K move between courses.
4. Watch the dashboard metrics update.
5. Sign in as the student to see the result.

**Admin → Scenarios & validation** replays TC-01 to TC-06 against the live database inside a transaction that is rolled back, and shows PASS for each.

---

## Security model

- **Authentication:** Supabase Auth. The API verifies every bearer token with Supabase (`auth.getUser`), then loads the profile and role from the database.
- **Authorization:**
  - **By role:** route-level `requireRole`.
  - **By record**, in `services/access.js`:
    - students reach only rows linked to their own `student_id`;
    - evaluators reach only cases they own or contain a course assigned to them, and can decide only their assigned courses;
    - admin-only routes are checked server-side.
- **Database:** RLS is enabled on every table with **no** policies, and privileges are revoked from `anon` and `authenticated`. Even with the public publishable key, the browser cannot read or write tables through PostgREST. Only the API's server-side connection can.
- **Secrets:** none in source. `.env` is git-ignored, and `.env.example` holds only public values. The service-role key is used by the seed script only, and is never served or bundled.
- **Hardening:**
  - helmet with a strict CSP (no inline scripts);
  - CORS allow-list;
  - rate-limited login;
  - zod validation of bodies, params and queries;
  - upload type and size limits;
  - parameterised SQL only;
  - error responses never leak stack traces.
- **Student privacy:** student DTOs are built separately and never include scores, engine wording or internal notes.

## Project structure

```
backend/
  src/
    config/        env (zod-validated), db pool + transactions, supabase clients
    routes/        route table + zod schemas
    controllers/   HTTP ↔ service mapping
    services/      business logic: domain rules, access, routing, intake, evaluation, metrics,
                   engine/ (TF-IDF + rules + recommender), auth/ providers
    repositories/  SQL per aggregate
    middleware/    authenticate, requireRole, validate, error handler, request context
    utils/         errors, formatting, PDF/text extraction
    types/         JSDoc data models
    seed/          fixtures + seeding logic
  supabase/migrations/   schema, views/functions, security
  scripts/         migrate, seed, engine-check
  test/            API tests (supertest)
frontend/          SPA: index.html, css/, js/ (api, store, pages/…)
```

## Testing without Supabase

The tests run against a plain PostgreSQL with a small `auth` shim (`supabase/local/`) and `AUTH_PROVIDER=local`:

```bash
cp .env.test.example .env.test   # set DATABASE_URL to a throwaway local database
DOTENV_CONFIG_PATH=.env.test npm run db:migrate   # applies the auth shim + migrations
npm run test:local                # reseeds inside the test, then runs 20 API tests (incl. the knowledge-base scenarios)
npm run test:unit                 # matcher, transcript reader and evaluation paths (no database)
DOTENV_CONFIG_PATH=.env.test npm run db:seed && npm run dev:local   # run the app against it
```

## Known limits

- Transcript originals are stored in Supabase Storage; syllabi and supporting documents still keep only their extracted text in Postgres.
- Email and institution-integration intake are defined (`services/ingestion/sources.js`) but not switched on; portal and manual uploads are live.
- Scanned images need `ANTHROPIC_API_KEY` for the vision reader; without it they are flagged for manual entry.
- Course descriptions come from the transcript's description supplement when it has one; otherwise matching uses the title only and confidence is lower.
- Students, grades, descriptions, syllabi, prerequisites and evaluators are Synthetic Data; only the worksheet tables are supplied data.
- Confidence is a heuristic, not a calibrated probability. Departments always make the final decision.
