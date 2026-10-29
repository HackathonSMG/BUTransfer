# Hackathon AI Innovation: Implementation

What the innovation pass added to the BU Transfer Credit Portal (`2_Code/transfer-app`), on branch `feature/ai-innovation`. The audit that chose these features is in `HACKATHON_AI_INNOVATION_AUDIT.md`. The demo is in `HACKATHON_DEMO_SCRIPT.md`.

> **AI assists, rules govern, the evaluator decides, and the Credit Evaluation Office is the final authority.**

---

## 1. What existed before

The portal already ran the whole process in the problem statement, from self-check to credit posted with grade T. Its automation was already substantial:

- **Course engine.** A deterministic, versioned engine settles each course through:
  - grade, withdrawal and repeat rules;
  - approved equivalencies;
  - past decisions;
  - TF-IDF content similarity to the BU catalog.
- **Course comparison.** Each BU learning outcome and topic is marked covered, partly covered or not evident.
- **Decision memory.** Every department decision becomes a precedent. When two different evaluators agree, the precedent is promoted to an equivalency, which is applied automatically from then on.
- **Conflict detection** with resolution tracking.
- **Explainable evaluator assignment**, based on expertise, workload, availability and hand-offs.
- **An optional Microsoft Foundry agent** that recommends outcomes for open courses and validates transcripts. It is not configured in local environments.

Measured on the STU-001 demo, 3 of 6 courses settled without department work (50%).

What it lacked, in the evaluator's terms:

- **No summary.** An evaluator assembled the picture from six collapsible sections.
- **First-time courses had no history.** A course never seen before showed no precedent, even when similar courses elsewhere had been decided many times.
- **No check before saving.** Nothing compared a decision with the institution's record before it was recorded.
- **Generic information requests.** Requests were free text or fixed chips.
- **Transcript problems surfaced late.** They were only discovered during department review.

## 2. What we added

| # | Capability | Who it helps | Where it shows |
|---|---|---|---|
| 1 | **Evaluation Context** | Evaluator | Review page, under the recommendation |
| 2 | **Course Precedent Intelligence** (cross-institution) | Evaluator | Evaluation Context; *Similar past decisions* |
| 3 | **Decision Consistency Check** | Evaluator, Credit Office | Decision dialog, live as the outcome changes |
| 4 | **Targeted Information Request** | Student, evaluator | *Request information* dialog, prefilled |
| 5 | **Transcript Quality Check** | Student, Credit Office | `/apply` after a transcript is read; Office application page |
| 6 | **Evaluation Pipeline Trace** (orchestration made visible) | Credit Office, judges | Office application page, *How this evaluation was prepared* |
| 7 | **Institutional Knowledge metric** | Credit Office, admin | Reports / Office dashboard impact panel |
| 8 | **Agent tool caching** | System | Foundry agent tool calls |

### Capability details

**1. Evaluation Context**
- **Purpose:** the evaluator starts from a one-screen summary instead of from zero.
- **User:** department evaluator.
- **How it works:** `workflow/evaluation-context.js · buildBrief()` reads the review package the API already assembles. That covers the comparison, the established equivalency, earlier decisions on this course, similar decisions elsewhere, conflicts, policy holds and units. It sorts each fact into one of:
  - **Supporting evidence**;
  - **Differences**;
  - **Needs attention**.

  It also adds a precedent line and a **suggested next step**: confirm, review the conflict, request the syllabus, review the differences, or decide.
- **Data used:** catalog descriptions and learning outcomes, the syllabus on file, `equivalencies`, `past_decisions`, `conflict_resolutions`, policy rules.
- **AI involved:** deterministic evidence synthesis over the IR results. Every line is a fact the system holds; nothing is generated.
- **Human control:** the next step is labelled "the decision is yours". The full sections remain below the summary.
- **Demo value:** high. It is the first thing the evaluator sees.

**2. Course Precedent Intelligence**
- **Purpose:** courses arriving for the first time still come with the institution's earlier judgements on *comparable* courses at other colleges.
- **User:** department evaluator.
- **How it works:** `credit/precedent-index.js` builds a TF-IDF index over every non-BU course that already has a judgement (an active equivalency or past decision), using its title, description, learning outcomes and syllabus. The course under review is matched against it. Results:
  - similar courses with a similarity of at least 0.20, each with its outcomes and similarity;
  - a tally of how they were decided.

  The index is cached and rebuilt whenever `invalidateEngine()` runs, which happens on every decision, promotion, revocation and standard. So a new decision is searchable at once.
- **Data used:** `catalog_courses`, `equivalencies`, `past_decisions`.
- **AI involved:** information retrieval (TF-IDF cosine), the same technique the engine uses to match the BU catalog. No model training and no vector database.
- **Human control:** evidence only. It never feeds the engine's outcome, and the similarity is shown so a weak neighbour is visible as weak.
- **Demo value:** high. It is the "the system remembers" moment.
- **Calibration on the sample data:**
  - 87 of 101 peer courses carry a judgement and are indexed.
  - Of the 14 peer courses that have never been decided, **13 find at least one similar decided course**.
  - Examples: NEU CS 2700 → NYU CSCI-UA 102 (0.74, CAS CS 112); NEU CS 3000 → NYU CSCI-UA 310 (0.70, CAS CS 330); NEU ECON 1116 → Riverside ECO 201 (0.64, CAS EC 101).

**3. Decision Consistency Check**
- **Purpose:** catch inconsistent decisions *before* they become precedent, since a wrong precedent spreads to future students.
- **User:** department evaluator. The Credit Office benefits downstream.
- **How it works:** `POST /api/my/reviews/:id/check` takes the same body as `/decision`, records nothing, and returns checks. `checkDecision()` compares the chosen outcome with:
  - the established equivalency;
  - every earlier decision on this course ("This decision differs from all 3 earlier decisions on CS 2000");
  - how similar courses elsewhere were decided;
  - open conflicts (and whether a conflict action was recorded);
  - **the content coverage of the BU course actually being awarded** (re-compared for *Different BU course*);
  - units against transcript credits and BU course credits;
  - Pass or unreadable grade holds and repeats.

  The dialog re-checks 300 ms after each change.
- **Data used:** the review package plus the BU catalog entry for the chosen course.
- **AI involved:** deterministic rules over IR evidence.
- **Human control:** a guardrail, never a block. The dialog says "you can still confirm this decision".
- **Demo value:** high. It shows that "AI removes repetitive work" also covers checking.

**4. Targeted Information Request**
- **Purpose:** students stop guessing what to send; evaluators stop typing the same request.
- **User:** student and evaluator.
- **How it works:** `suggestRequest()` turns the comparison's gaps into a request. For example: "To compare CS 2000 Introduction to Program Design with Boston University's CAS CS 111, please send the course syllabus with its weekly topics showing coverage of: Analyze algorithm running time; the number of credits for CS 2000…". It also handles:
  - no content on file: syllabus, weekly topics, outcomes, assessment;
  - fewer credits: contact hours;
  - a BU lab with no lab evident: lab hours;
  - missing credits;
  - an unreadable grade.

  It prefills *Request information* and *Record decision → Request more information*.
- **Data used:** the comparison's not-evident outcomes, the credit comparison, BU and transfer course texts, policy holds.
- **AI involved:** deterministic drafting from structured gaps.
- **Human control:** the evaluator edits before sending. Nothing is sent automatically.
- **Demo value:** high. The student receives a concrete list.

**5. Transcript Quality Check**
- **Purpose:** surface what will slow evaluation at upload time, not weeks later.
- **User:** student (plain language) and Credit Office (staff wording).
- **How it works:** `credit/transcript-quality.js · checkTranscript()` uses the engine's own grade rules from `policy.js`. It flags:
  - missing credits;
  - unreadable or incomplete grades;
  - Pass grades;
  - grades below the minimum;
  - W;
  - repeats (different term);
  - the same row read twice (same term and grade);
  - missing terms;
  - an unknown calendar;
  - quarter conversion;
  - courses never evaluated before.

  `POST /api/student/transcripts/read` returns only the plain wording (`review_notes`). The student sees "We found information that may require additional review", what it is, and "You can still submit". The Office page shows the staff wording under *Transcript check*.
- **Data used:** parsed transcript rows, catalog and equivalency course codes.
- **AI involved:** deterministic validation. When the Foundry agent is configured, it adds institution and accreditation validation (unchanged).
- **Human control:** advisory. Nothing is blocked or changed.
- **Demo value:** medium-high.

**6. Evaluation Pipeline Trace**
- **Purpose:** make the orchestration visible and measurable for each application.
- **User:** Credit Office; judges during the demo.
- **How it works:** `runEvaluation` already orchestrated the stages. `workflow/pipeline-trace.service.js` now records what each one did, with counts and timings, in `ai_evaluations.pipeline_trace` (migration `012_evaluation_trace.sql`). The stages are:
  1. Transcripts read;
  2. Transcript quality check;
  3. Course matching;
  4. Precedent search;
  5. Additional course review (agent);
  6. Established outcomes;
  7. Evaluator routing.

  The Office application page shows it as *How this evaluation was prepared*.
- **AI involved:** recording only.
- **Human control:** n/a. The footer states that every academic decision stays with departments and the Office.
- **Demo value:** high. It is the "intelligent process" diagram, from real data.

**7. Institutional Knowledge metric**

The impact panel adds:
- established equivalencies (and how many were learned);
- precedents on record (and how many were recorded by evaluators in this system);
- courses settled by reuse.

All are counted from the database. **Demo value:** it closes the story: every evaluation strengthens the next one.

**8. Agent tool caching.** See section 8.

## 3. Why AI was used

The sponsor's pain is "repeated manual comparison of course descriptions, learning outcomes and credit hours" and searching for precedent. Those are retrieval and comparison problems, and AI earns its place there:

- **Information retrieval** finds comparable decided courses across institutions. That is the step a human can't do quickly in a growing equivalency database.
- **Evidence synthesis** turns six sections into one summary and one suggested next step.
- **Gap analysis** turns "not evident" outcomes into a specific request.

## 4. Why AI was NOT used in certain areas

| Area | Decision | Reason |
|---|---|---|
| Credit decisions | Never automated beyond existing equivalencies and deterministic policy | Problem statement: departments decide |
| Student explanations | Kept as templates | An LLM could misstate a decision; the templates are exact |
| Status ETA | Not built | Too little history to estimate honestly; inventing a date would mislead students |
| Consistency check | Rules over evidence, no model | Must be reproducible and explainable to the evaluator |
| Similarity | TF-IDF, no embeddings or vector DB | 101 peer courses; TF-IDF is instant, deterministic and already in the codebase. Embeddings are a drop-in upgrade when the catalog grows (section 14) |
| Chatbot | Not built | The brief asked for work done behind the scenes, not conversation |

The optional Foundry LLM agent remains where language understanding helps: unknown transcript layouts, institution validation and recommendations for courses with no precedent. It still never sees student identity and cannot introduce a BU code that is not in the catalog.

## 5. Agent architecture

The codebase already had an orchestrator: `runEvaluation`, which runs its stages in order. We kept it as a **lightweight, recorded pipeline** instead of adding an agent framework:

```
                       runEvaluation (orchestrator)            ── records → ai_evaluations.pipeline_trace
                                   │
   ┌──────────────┬────────────────┼─────────────────┬──────────────────┬───────────────────┐
   ▼              ▼                ▼                 ▼                  ▼                   ▼
Document      Quality check     Matching         Precedent search   Additional review   Established outcomes
(parser,      (transcript-      (engine.js:      (knowledge +       (Foundry agent,     + Routing
 AI fallback)  quality.js)       rules, eq,        precedent-index)   optional, tools)    (assignment.service)
                                 precedent, IR)
                                   │
                                   ▼
                    Decision support at review time (on demand)
                    evaluation-context.js: brief · request draft · consistency check
                                   │
                                   ▼
                       Department evaluator decides
                                   │
                                   ▼
                    Credit Evaluation Office: final review, posting
                                   │
                                   ▼
               Decision memory (memory.service) → precedent → equivalency
               → invalidates engine + precedent index → the next transcript benefits
```

Why not a multi-agent framework: the stages are deterministic, ordered and take milliseconds. Agents talking to agents would add latency, cost and non-determinism without improving any outcome.

## 6. AI workflow

1. **Upload:** the transcript is read (structured parser; AI fallback when configured) and the quality check runs. The student sees plain notes.
2. **Submit:** the orchestrator runs. Matching settles what rules, equivalencies and precedents can; the precedent search counts what the institution already knows; established outcomes are applied; the rest is routed by expertise and workload. Every stage is traced.
3. **Review:** the evaluator opens a course and sees the Evaluation Context (with similar decided courses elsewhere). If content is missing, a drafted request is one click away.
4. **Decide:** the consistency check runs live in the dialog. The evaluator confirms or adjusts.
5. **Learn:** the decision becomes a precedent. The engine and the precedent index are rebuilt, so the next similar course sees it immediately.

## 7. Human-in-the-loop design

| AI never… | Enforced by |
|---|---|
| awards credit | Only `decideReview` (evaluator), `applyEstablished` (existing equivalencies and deterministic policy only) and `postCredits` (Office) write decisions or postings. The new modules write nothing except the trace |
| rejects a course | The consistency check returns warnings; the endpoint has no write path |
| overrides policy | Policy stays in `policy.js` and the engine, unchanged |
| changes grades or records | The quality check reads parsed rows; it never modifies them |
| bypasses review | Brief, request draft and check are shown to the evaluator; the request is sent only on click |
| exposes internals to students | `/transcripts/read` returns only the `student` wording. The trace, staff wording and precedents are staff-only routes |

## 8. Performance improvements

| Problem | Current behaviour | Change | Expected impact |
|---|---|---|---|
| Agent `search_bu_catalog` rebuilt a TF-IDF index over the BU catalog on every tool call | 5–15 rebuilds per agent run | Built once per reference set (`WeakMap` cache in `agent.service.js`) | One build per run; each tool call does only the similarity pass |
| Agent `search_precedents` rebuilt the evidence map on every call | Same | Same cache | Same |
| Cross-institution search would rebuild its index per request | n/a (new feature) | Index cached; rebuilt only on `invalidateEngine()` | Built once per change, not per page view |
| Consistency check on every keystroke | n/a (new) | Debounced to 300 ms; reuses `getReview` | One request per settled change |

Found but **not changed**, to avoid disturbing working code. Documented in the audit (P3–P6):
- `listConflicts` and the evaluator dashboard run `courseKnowledge` per course (N+1);
- the transcript is parsed twice at intake;
- `programSubjects()` is loaded per queued course.

## 9. Hackathon differentiators

**Implemented**
1. **"The system remembers"**: cross-institution precedent search. A course never seen before still arrives with how comparable courses were decided.
2. **Evaluation Context**: one screen of evidence (supporting, differences, attention) and a next step.
3. **Consistency check before finalizing**: a guardrail that protects the equivalency memory from inconsistent precedent.
4. **Pipeline trace**: the "intelligent process" shown from real timings and counts for each application.
5. **Institutional knowledge metric**: the learning loop, counted.

**Recommended, not implemented**
- **Transfer knowledge graph view** (institution → course → BU course → program). The data model supports it (equivalencies, past_decisions, catalog program); it needs a graph visual. Medium effort, demo-only value.
- **"Why this decision?" panel on the student page.** Student explanations exist; a structured checklist (content, credits, grade, precedent, rules) would need care to stay non-internal.
- **Embeddings for similarity** once the catalog reaches the planned scale (~150 BU, ~200 peer courses); a drop-in for `TfIdf` in `precedent-index.js`.
- **Batching `courseKnowledge`** for the Conflicts page and the evaluator dashboard (P4/P5).
- **"What changed?" digest** for returning evaluators. The status banners cover the main cases today.

## 10. Expected business impact

These are stated as hypotheses with how to measure them. No figures were fabricated.

| Impact | Mechanism | Measured by (already stored) |
|---|---|---|
| Less evaluator time per course | Brief and precedent search replace manual assembly and searching | `impact.median_hours.evaluator_review` (started_at → completed_at), before and after |
| Fewer syllabus round-trips | Specific requests; issues flagged at upload | Syllabus requests per course; time in `info_requested` |
| More consistent equivalencies | Check before saving | Conflict rate (`/api/admin/conflicts` count) per decided course |
| Faster reuse over time | Every decision is searchable at once | `knowledge.reused`, `automation_rate` trend |

To prove it: run the same synthetic queue with the brief and check hidden (a feature flag), then visible, and compare median review times and conflict rates. BU's current turnaround would be the real baseline (PS-20 in the implementation summary).

## 11. Technical architecture

**New files**

| File | Kind | Role |
|---|---|---|
| `backend/src/services/credit/transcript-quality.js` | pure | Transcript quality check |
| `backend/src/services/credit/precedent-index.js` | pure core + cached loader | Cross-institution precedent search |
| `backend/src/services/workflow/evaluation-context.js` | pure | Brief, request draft, consistency check |
| `backend/src/services/workflow/pipeline-trace.service.js` | service | Trace recorder, per-application quality, precedent scan |
| `backend/supabase/migrations/012_evaluation_trace.sql` | migration | `ai_evaluations.pipeline_trace JSONB` (additive) |
| `frontend/src/components/staff/PreparationTrace.jsx` | UI | Trace timeline |

**Changed files (additive only)**

| File | Change |
|---|---|
| `services/workflow/review.service.js` | `getReview` adds `similar_elsewhere`, `brief`, `suggested_request`; new `checkReviewDecision` |
| `routes/my.js` | `POST /api/my/reviews/:id/check` |
| `services/application.service.js` | `runEvaluation` records the trace (no logic change to the stages) |
| `services/credit/credit.service.js` | `readTranscript` adds `quality`; `invalidateEngine` also invalidates the precedent index |
| `controllers/student.controller.js` | `/transcripts/read` adds `review_notes` (student wording only) |
| `routes/office.js` | Office application adds `quality`, `trace` |
| `services/workflow/impact.service.js` | Adds `knowledge` (institution-wide only) |
| `services/ai/agent.service.js` | Tool caching |
| `pages/evaluator/ReviewDetail.jsx` | Evaluation Context, similar courses elsewhere, live consistency check, prefilled requests |
| `pages/office/OfficeApplication.jsx` | Preparation trace, transcript check |
| `pages/applicant/TransferCreditApplication.jsx` | Review notes after a transcript is read |
| `components/staff/ImpactPanel.jsx` | Institutional knowledge row |
| `api/my.js` | `checkReviewDecision` |

**Deploy:** run `012_evaluation_trace.sql` (additive, idempotent), then merge. Applications evaluated earlier show no trace until they are evaluated again. Everything else works on existing data.

**Verification (29 October 2026).** The database was rebuilt from all 12 migrations on a local in-memory Postgres (PGlite), then seeded with the credit data, the sponsor workbook, the 11 sample students (through the real upload and evaluation pipeline) and the workflow roster:

| Suite | Result |
|---|---|
| Existing scenario suite (`5_Test_Cases/transcripts/run_scenarios.mjs`, real API) | **24/24 pass**: no regression |
| Credit engine answer key (`npm run credit:eval`) | **76/76 path, 76/76 award**: unchanged |
| Evaluation-context unit checks (brief, request draft, consistency check: every branch) | Pass |
| Transcript quality check over all 15 sample and 17 test-case PDFs | Flags exactly the designed cases: TC08 Pass grade, TC13 missing credits, TC14/TC15 unknown courses, TC11 repeat, below-C and W rows, quarter calendars; the clean transcripts show no attention items |
| Integration (real services) | 8/8: the trace records all 7 stages in order; every one of 26 open reviews gets a brief (20 with similar decided courses elsewhere, 18 with a drafted request); the check records nothing; deciding still works; the precedent index rebuilds after a decision; the knowledge metric is counted from the database |
| Live demo submission (STU-001 through draft → upload → submit) | 3 courses settled automatically, 3 routed to 3 evaluators, **0.6 s** end to end; the second submission already showed "1 evaluated before" from the first one's decision |
| HTTP and role checks | 12/12: students receive only plain notes; another evaluator gets 404 and the Office gets 403 on the check route; evaluators get 403 on the Office view |
| Frontend production build | Builds without errors |

Not exercised: the Foundry agent (not configured locally) and real Supabase Auth and Storage (stand-ins were used in the test harness only; no repository code was changed for testing).

## 12. Demo flow

See `HACKATHON_DEMO_SCRIPT.md`. Seven minutes, the STU-001 transcripts (the problem statement's suggested scenario), and four roles.

## 13. Limitations

- **Small reference data.** Similarity thresholds (0.20 for peers, 0.25 for BU matching) are calibrated on 41 BU and 101 peer courses. On the planned full catalog they must be re-checked.
- **TF-IDF is lexical.** Courses with the same content in different words ("data structures" vs "abstract data types") score lower than they should. The similarity is always shown, and embeddings are the upgrade path.
- **The consistency check knows only recorded data.** Policies the problem statement leaves open (Pass grades, lab bundling, per-school minimum grade) are flagged as configurable assumptions, not enforced.
- **The trace exists only for evaluations run after migration 012.**
- **The Foundry agent was not exercised** in local verification (not configured). Its tool caching was checked for behaviour-preserving structure, not against a live agent.

## 14. Future possibilities

- Embedding-based similarity (Azure OpenAI embeddings) behind the same `similar()` interface, with TF-IDF as the fallback.
- A knowledge-graph explorer for the Credit Office (institution ↔ course ↔ BU course ↔ program).
- An LLM *explainer* (never a decider) that phrases the Evaluation Context as a paragraph, grounded only in the brief's facts and checked against them.
- Measuring the consistency check's effect: how often a warning leads to a changed decision (logging the shown checks with the decision).
- Feeding the cross-institution tally to the Foundry agent as an additional tool.
